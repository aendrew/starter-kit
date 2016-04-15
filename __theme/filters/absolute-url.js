module.exports = absolute_url;

function absolute_url(str) {
  if (typeof str !== 'string') return false;
  return /^https?:\/\//.test(str);
}
