(function(){
var PLAN={
Monday:['Cape Fear Seafood Company','21 Main At North Beach','Rioz Brazilian Steakhouse',"Hamburger Joe's","Fat Harold's Beach Club","Captain Archie's",'The Shack',"Blueberry's Grill",'Villa Tuscanna','Crooked Hammock Brewery'],
Tuesday:['The Brentwood Restaurant',"Jilla's Gourmet Kitchen",'Sunny Side Up Grill',"The Parson's Table","Cooper's Tavern",'The Star Tavern','Be Known Coffee Company',"Gabriella's N. Atlantic Seafood","Captain Nance's Seafood","Beck's Restaurant"],
Wednesday:["Drunken Jack's Restaurant",'Dead Dog Saloon','Wicked Tuna','Blue Sky Family Restaurant',"Russell's Seafood Grill","Neal's Creekhouse",'Pie Eyed Parrot Cruise','Conch Cafe','Kimbels at Wachesaw','La Taqueria'],
Thursday:['Rivertown Bistro',"Groucho's Deli","Sam's Southern Eatery",'Taqueria Antojitos Guanajuato',"Big D's BBQ Trough",'Bellissimo Italian Pizzeria','Trestle Restaurant',"Radd Dew's Bar-B-Que Pit",'Wild Wing Plantation','Caribbean Jerk Cuisine'],
Friday:['Martini',"Dagwood's Deli & Sports Bar",'Tidal Creek Brewhouse','SOHO Steak & Seafood','New South Brewing',"Bennett's Calabash Seafood #2","Nonna's Taste of Italy",'Tavern in the Forest',"Bubba's Fish Camp & Smokehouse","Dino's House of Pancakes"]
};
function norm(s){return(s||'').toLowerCase().replace(/[''`]/g,"'").replace(/[^a-z0-9\s']/g,' ').replace(/\s+/g,' ').trim();}
function score(a,b){var na=norm(a),nb=norm(b);if(na===nb)return 1;if(na.includes(nb)||nb.includes(na))return 0.9;var wa=new Set(na.split(' '));var ov=nb.split(' ').filter(function(w){return w.length>2&&wa.has(w);}).length;return ov/Math.max(wa.size,nb.split(' ').length);}
var records=JSON.parse(localStorage.getItem('vs_db')||'[]');
var canvass=JSON.parse(localStorage.getItem('vs_c1')||'[]');
var exIds=new Set(canvass.map(function(c){return c.fromDb;}).filter(Boolean));
var exNames=new Set(canvass.map(function(c){return(c.name||'').toLowerCase();}));
var matched=[],unmatched=[],stops=[];
Object.entries(PLAN).forEach(function(entry){
  var day=entry[0],names=entry[1];
  names.forEach(function(planName){
    var best=null,bs=0;
    records.forEach(function(r){var s=score(planName,r.n);if(s>bs){bs=s;best=r;}});
    if(best&&bs>=0.4){
      matched.push({planName:planName,record:best,day:day,score:bs});
      best.da=day;
      if(!exIds.has(best.id)&&!exNames.has((best.n||'').toLowerCase())&&best.st==='unworked'){
        var now=new Date().toISOString();
        stops.push({id:'canvass_'+best.id,name:best.n,addr:best.a,phone:best.ph,notes:'',website:best.web,menu:best.mn,email:best.em,lat:best.lt,lng:best.lg,status:'Not visited yet',date:new Date().toLocaleDateString(),added:now,fromDb:best.id,score:best.sc,priority:best.pr,history:[],notesLog:[]});
        best.st='in_canvass';
      }
    } else {
      unmatched.push({planName:planName,day:day,bs:bs.toFixed(2),bm:best?best.n:'none'});
    }
  });
});
localStorage.setItem('vs_db',JSON.stringify(records));
localStorage.setItem('vs_c1',JSON.stringify(canvass.concat(stops)));
console.log('Matched: '+matched.length+'/50');
matched.forEach(function(m){console.log('  '+m.day+': "'+m.planName+'" -> "'+m.record.n+'" ('+Math.round(m.score*100)+'%)');});
console.log('No match: '+unmatched.length);
unmatched.forEach(function(u){console.log('  '+u.day+': "'+u.planName+'" -- closest: "'+u.bm+'" ('+u.bs+')');});
console.log('Stops added: '+stops.length);
console.log('Done -- reload the page.');
})();
