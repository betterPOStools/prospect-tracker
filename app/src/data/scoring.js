export function calcScore(r) {
  let s = 100
  if (r.ch) s -= 15
  if ((r.rt || 0) < 3.0) s -= 20; else if ((r.rt || 0) < 4.0) s -= 10
  if ((r.rv || 0) < 20)  s -= 20; else if ((r.rv || 0) < 50)  s -= 10
  if (!r.em)  s -= 15
  if (!r.web) s -= 10
  return Math.max(s, 0)
}

export function calcPriority(s) {
  return s >= 80 ? 'Hot' : s >= 50 ? 'Warm' : 'Cold'
}
