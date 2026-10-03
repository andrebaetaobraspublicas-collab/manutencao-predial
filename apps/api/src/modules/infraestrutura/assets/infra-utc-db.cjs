'use strict';

// MariaDB 3.5.3 sets SQL session time_zone with timezone:'Z', but serializes
// Date parameters and decodes DATETIME in the Node process's local timezone.
// Keep this explicit conversion confined to the independent Infra database.
function utcValues(values) {
  return values.map(value => value instanceof Date
    ? value.toISOString().slice(0, 23).replace('T', ' ')
    : value);
}

function utcTypeCast(field, next) {
  if (field.type !== 'DATETIME' && field.type !== 'TIMESTAMP') return next();
  const value = field.string();
  if (value == null || value.startsWith('0000-00-00')) return null;
  return new Date(value.replace(' ', 'T') + 'Z');
}

module.exports = { utcValues, utcTypeCast };
