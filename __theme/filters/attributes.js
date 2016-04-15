module.exports = attributes;

function attributes(object, kwargs) {
  if (!object) return '';

  const safe = this.env.filters.safe;
  let result = [];
  let value;
  let type;
  let attribute;
  let exclude = {};

  kwargs = kwargs || {};

  if (kwargs.include) {

    let _include = {};
    if (typeof kwargs.include === 'string') { 
      _include[kwargs.include] = true;
    } else if (Array.isArray(kwargs.include)) {
      kwargs.include.filter(Boolean).forEach(d => _include[d] = true);
    } else {
      Object.keys(kwargs.include).forEach(d => _include[d] = true);
    }

    exclude = Object.keys(object).reduce((o, d) => {
      if (!_include[d]) o[d] = true;
      return o;
    }, {}); 

  } else if (kwargs.exclude) {
    if (typeof kwargs.exclude === 'string') { 
      exclude[kwargs.exclude] = true;
    } else if (Array.isArray(kwargs.exclude)) {
      kwargs.exclude.filter(Boolean).forEach(d => exclude[d] = true);
    } else {
      Object.keys(kwargs.exclude).forEach(d => exclude[d] = true);
    }
  }

  for (let key in object) {
    if (object.hasOwnProperty(key) && !exclude.hasOwnProperty(key)) {
      value = object[key];
      type = typeof value;
      attribute = [key];
      if (type === 'boolean') {
        attribute.push(value ? 'true' : 'false');
      } else if (type === 'string') {
        attribute.push(value);
      } else if (type === 'number' && Number.isFinite(value)) {
        attribute.push(value.toString());
      } else if (Array.isArray(value)) {
        attribute.push(value.join(' '));
      }
      result.push(attribute);
    }
  }

  return safe(result.map(d => d.length > 1 ? (d[0] + '="' + d[1] + '"') : (d[0] || '')).join(' '));
}
