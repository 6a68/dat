var path = require('path')
var fs = require('fs')
var concat = require('concat-stream')
var extend = require('extend')
var request = require('request')

module.exports = Meta

function Meta(dat, ready) {
  var self = this
  if (!(this instanceof Meta)) return new Meta(dat, ready)
  if (!ready) ready = function noop() {}
  this.dat = dat
  this.reserved = ['_id', '_seq', '_rev', '_ver']
  this.schemas = {0: {version: 0, columns: []}}
  this.file = path.join(this.dat.dir, '.dat', 'dat.json')
  
  this.read(function(err, json) {
    if (err) json = {}
    self.json = json
    if (!self.json.columns) self.json.columns = []
    if (!self.json.schemaVersion) self.json.schemaVersion = 0
    ready(err)
  })
}

Meta.prototype.read = function(cb) {
  fs.readFile(this.file, function(err, buf) {
    if (err) return cb(err)
    cb(null, JSON.parse(buf))
  })
}

Meta.prototype.write = function(json, cb) {
  var self = this
  fs.writeFile(this.file, JSON.stringify(json, null, '  ') + '\n', function(err) {
    self.json = json
    cb(err)
  })
}

Meta.prototype.update = function(json, cb) {
  var self = this
  self.read(function(err, obj) {
    if (err) obj = {}
    var updated = extend({}, obj, json)
    self.write(updated, cb)
  })
}

Meta.prototype.currentSchema = function() {
  var self = this
  var ver = self.json.lastSchema
  return self.schemas[ver]
}

Meta.prototype.addColumns = function(columns, cb) {
  var self = this
  if (!(columns instanceof Array)) columns = [columns]

  this.json.columns = this.json.columns.concat(columns)
  this.dat.schemas.put('schema', this.json, {valueEncoding: 'json'}, function(err, version) {
    if (err) return cb(err)
    versionKey = version.join('-')
    self.schemas[versionKey] = {
      version: version[0],
      id: version[1],
      columns: self.json.columns
    }
    self.json.lastSchema = versionKey
    self.update(self.json, cb)
  })
}

Meta.prototype.getNewColumns = function(a) {
  var b = this.json.columns
  var newColumns = []
  for (var y = 0; y < a.length; y++) {
    if (this.reserved.indexOf(a[y]) > -1) continue
    var exists = false
    for (var x = 0; x < b.length; x++) {
      if (b[x] === a[y]) {
        exists = true
        continue
      }
    }
    if (!exists && newColumns.indexOf(a[y]) === -1) {
      newColumns.push(a[y])
    }
  }
  return newColumns
}

Meta.prototype.loadAllSchemas = function(cb) {
  var self = this
  if (self.json.schemaVersion === 0) return cb()
  self.dat.schemas.createReadStream().pipe(concat(function(schemas) {
    schemas.map(function(schema) {
      self.schemas[schema.version] = {
        version: schema.version,
        columns: JSON.parse(schema.value).columns
      }
    })
    cb()
  }))
}

Meta.prototype.pullSchemas = function(remote, cb) {
  var self = this
  request({json: true, url: remote + '/_schemas'}, function(err, resp, schemas) {
    if (err || resp.statusCode > 299) return cb(err || true)
    var versions = Object.keys(schemas).sort(function(a, b) { return a > b })
    var pending = versions.length
    var errs = []
    
    versions.map(function(v) {
      if (v === '0') return pending-- // skip empty version 0
      self.dat.schemas.put('schema', schemas[v], {version: v, valueEncoding: 'json'}, done)
      self.schemas[v] = schemas[v]
    })
    
    function done(err, version) {
      if (err) errs.push(err)
      if (--pending !== 0) return
      self.json.schemaVersion = versions[versions.length]
      self.update(self.json, function(err) {
        if (err) return cb(err)
        if (errs.length > 0) return cb(errs)
        cb(null)
      })
    }
  })
}
