var bops = require('bops')
var concat = require('concat-stream')
var Dat = require('../../')

module.exports.pullReplication = function(test, common) {
  test('pull replication', function(t) {
    var expected = ["1", "2"]
    var dat2 = new Dat(common.dat2tmp, { serve: false }, function ready() {
      common.getDat(t, function(dat, cleanup) {
        var ws = dat.createWriteStream({ csv: true })
        var nums = []
    
        ws.on('close', function() {
          dat2.pull(function(err) {
            console.log('pull done')
            if (err) throw err
            common.compareData(t, dat, dat2, function() {
              done()
            })
          })
        })
    
        ws.write(bops.from('a\n1\n2'))
        ws.end()
 
        function done() {
          dat2.createReadStream().pipe(concat(function(data) {
            var results = data.map(function(r) { return r.a })
            t.equals(JSON.stringify(results), JSON.stringify(expected), 'createReadStream() matches')
            dat2.destroy(function(err) {
              t.false(err, 'no err')
              cleanup()
            })
          }))
        }
      })
    })
  })
}

module.exports.pullReplicationMultiple = function(test, common) {
  test('multiple pulls', function(t) {
    var expected = ["pizza", "walrus"]
    var dat2 = new Dat(common.dat2tmp, { serve: false }, function ready() {
      common.getDat(t, function(dat, cleanup) {
        var doc1 = {a: 'pizza'}
        var doc2 = {a: 'walrus'}
        
        putPullCompare(doc1, function() {
          putPullCompare(doc2, function() {
            done()
          })
        })
        
        function putPullCompare(doc, cb) {
          dat.put(doc, function(err, doc) {
            if (err) throw err
            dat2.pull(function(err) {
              if (err) throw err
              common.compareData(t, dat, dat2, function() {
                cb()
              })
            })
          })
        }
        
        function done() {
          dat2.createReadStream().pipe(concat(function(data) {
            var results = data.map(function(r) { return r.a })
            t.equals(JSON.stringify(results), JSON.stringify(expected), 'createReadStream() matches')
            dat2.destroy(function(err) {
              t.false(err, 'no err')
              cleanup()
            })
          }))
        }
      })
    })
  })
}

module.exports.pullReplicationLive = function(test, common) {
  test('live pull replication', function(t) {
    var dat2 = new Dat(common.dat2tmp, { serve: false }, function ready() {
      common.getDat(t, function(dat, cleanup) {
        var pull = dat2.pull({ live: true })
        dat.put({foo: 'bar'}, function(err) {
          if (err) throw err
          setTimeout(function() {
            dat2.createReadStream().pipe(concat(function(data) {
              t.equal(data.length, 1)
              t.equal(data[0].foo, 'bar')
              pull.stream.end()
              dat2.destroy(function(err) {
                if (err) throw err
                cleanup()
              })
            }))
          }, 250)
        })
      })
    })
  })
}

module.exports.pullReplicationLiveMultiple = function(test, common) {
  test('live pull replication w/ multiple puts', function(t) {
    var dat2 = new Dat(common.dat2tmp, { serve: false }, function ready() {
      common.getDat(t, function(dat, cleanup) {
        var pull = dat2.pull({ live: true })
        dat.whoami = 'dat1'
        dat2.whoami = 'dat2'
        dat.put({foo: 'bar'}, function(err) {
          if (err) throw err
          dat.put({bar: 'baz'}, function(err) {
            if (err) throw err
            setTimeout(function() {
              dat2.createReadStream().pipe(concat(function(data) {
                console.log('DATA', data)
                t.equal(data.length, 2)
                t.equal(data[0].foo, 'bar')
                t.equal(data[0].bar, 'baz')
                done()
              }))
            }, 250)
          })
        })
        
        function done() {
          pull.stream.end()
          dat2.destroy(function(err) {
            if (err) throw err
            cleanup()
          })
        }
      })
    })
  })
}


module.exports.pushReplication = function(test, common) {
  test('push replication', function(t) {
    var expected = ["pizza", "walrus"]
    common.getDat(t, function(dat, cleanup) {
      var doc1 = {a: 'pizza'}
      var doc2 = {a: 'walrus'}
      var dat2port
      
      var dat2 = new Dat(common.dat2tmp, function ready(err) {
        if (err) throw err
        dat2port = dat2._server.address().port
        
        putPushCompare(doc1, function() {
          putPushCompare(doc2, function() {
            done()
          })
        })
      })

      function putPushCompare(doc, cb) {
        dat.put(doc, function(err, doc) {
          if (err) throw err
          dat.push('http://localhost:' + dat2port, function(err) {
            if (err) throw err
            common.compareData(t, dat, dat2, function() {
              cb()
            })                
          })
        })
      }
    
      function done() {
        dat2.createReadStream().pipe(concat(function(data) {
          var results = data.map(function(r) { return r.a })
          t.equals(JSON.stringify(results), JSON.stringify(expected), 'createReadStream() matches')
          dat2.destroy(function(err) {
            t.false(err, 'no err')
            cleanup()
          })
        }))
      }
    })
  })
}

module.exports.remoteInit = function(test, common) {
  test('init using remote url', function(t) {
    common.getDat(t, function(dat, cleanup) {
      dat.put({foo: 'bar'}, function(err) {
        if (err) throw err
        var dat2 = new Dat(common.dat2tmp, {serve: false, remote: 'http://localhost:' + dat.defaultPort}, function ready() {
          dat2.createReadStream().pipe(concat(function(data) {
            t.equal(data.length, 1)
            t.equal(data[0].foo, 'bar')
            dat2.destroy(function(err) {
              if (err) throw err
              cleanup()
            })
          }))
        })
      })
    })
  })
}


module.exports.all = function (test, common) {
  module.exports.pullReplication(test, common)
  module.exports.pullReplicationMultiple(test, common)
  module.exports.pullReplicationLive(test, common)
  module.exports.pushReplication(test, common)
  module.exports.remoteInit(test, common)
  module.exports.pullReplicationLiveMultiple(test, common)
}
