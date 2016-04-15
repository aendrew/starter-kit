module.exports = function (d, val) {
  if (Array.isArray(d)) {
    return d.indexOf(val) !== -1;
  } else if (typeof d === 'string') {
    return d.indexOf(val) !== -1;
  }
}
