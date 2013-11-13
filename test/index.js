var assert = require('assert')

var pop = require('../')


describe('read 1', function() {
  beforeEach(function() {
    this.stream = new require('stream').PassThrough({objectMode: true})
    this.write = function(name, async) {
      if(!async) return this.stream.write({name: name});
      setTimeout(function() {
        this.stream.write({name: name})
      }.bind(this), 10)
    }
  })

  it('single reader', function(done) {
    var count = 0
    pop(this.stream, function(obj, next) {
      assert.equal(obj.name, 'brian')
      done()
    })
    this.stream.write({name: 'brian'})
  })

  it('two readers', function(done) {
    var count = 0
    var self = this
    pop(this.stream, function(obj, next) {
      assert.equal(obj.name, 'brian')
      pop(self.stream, function(obj, next) {
        assert.equal(obj.name, 'aaron')
        done()
      })
    })
    this.stream.write({name: 'brian'})
    this.stream.write({name: 'aaron'})
  })

  it('two concurrent readers', function(done) {
    var count = 0
    var worker = function (obj, next) {
      if(count++ === 0) {
        return assert.equal(obj.name, 'brian')
      }
      assert.equal(obj.name, 'aaron')
      done()
    }
    pop(this.stream, worker)
    pop(this.stream, worker)
    this.stream.write({name: 'brian'})
    this.write('aaron')
  })

  it('works with already loaded stream', function(done) {
    this.stream.write({name: 'brian'})
    this.stream.write({name: 'aaron'})
    var count = 0
    pop(this.stream, function(obj, next) {
      next()
      if(count++ == 1) done()
    })
  })

  it('works with stream latency', function(done) {
    this.stream.write({name: 'brian'})
    var self = this
    setTimeout(function() {
      self.stream.write({name: 'aaron'})
    }, 10)
    var count = -1
    pop(this.stream, function(obj, next) {
      assert.equal(obj.name, count++ ? 'brian' : 'aaron')
      next()
      if(count) done()
    })
  })

  it('works with stream latency with multiple readers', function(done) {
    this.stream.write({name: 'brian'})
    var self = this
    setTimeout(function() {
      self.stream.write({name: 'aaron'})
    }, 10)
    var count = -1
    var worker = function(obj, next) {
      assert.equal(obj.name, count++ ? 'brian' : 'aaron')
      next()
      if(count) done()
    }
    pop(this.stream, worker)
    pop(this.stream, worker)
  })

  describe('error handling', function() {

    it('emits error passed to callback', function(done) {
      this.stream.write({name: 'brian'})
      var worker = pop(this.stream, function(obj, next) {
        return next(new Error('something bad happened'))
      })
      worker.on('error', function(err) {
        assert.equal(err.message, 'something bad happened')
        done()
      })
    })

    it('emits error on exception', function(done) {
      this.stream.write({name: 'brian'})
      var worker = pop(this.stream, function(obj, next) {
        throw new Error('something bad happened')
      })
      worker.once('error', function(err) {
        assert.equal(err.message, 'something bad happened')
        done()
      })
    })

    it('emits async error', function(done) {
      setTimeout(function() {
        this.stream.write({name: 'brian'})
      }.bind(this), 10)
      var worker = pop(this.stream, function(obj, next) {
        if(!process.domain) {
          return done(new Error('Not in a domain'))
        }
        setImmediate(function() {
          throw new Error('something bad happened')
        })
      })
      worker.on('error', function(err) {
        assert.equal(err.message, 'something bad happened')
        done()
      })
    })

    it('emits async error way down the line and keeps reading', function(done) {

      setTimeout(function() {
        this.stream.write({name: 'brian'})
        this.stream.write({name: 'aaron'})
        this.stream.write({name: 'shelley'})
      }.bind(this), 10)

      var errorCount = 0
      var worker = pop(this.stream, function(obj, next) {
        if(!process.domain) {
          return done(new Error('Not in a domain'))
        }
        if(obj.name !== 'shelley') throw new Error('something bad happened');
        if(obj.name === 'shelley') return done();
        assert.equal(errorCount, 2, 'should have received 2 errors')
        next()
      })
      worker.on('error', function(err) {
        assert.equal(err.message, 'something bad happened')
        worker.resume()
        errorCount++
      })
    })
  })

  it('paused after error is emmitted', function(done) {
    this.stream.write({name: 'brian'})
    this.stream.write({name: 'aaron'})
    var worker = pop(this.stream, function(obj, next) {
      setTimeout(function() {
        throw new Error('something bad happened')
      }, 10)
    })
    worker.once('error', function(err) {
      worker.pause()
      done()
    })
  })

  it('still finishes if one worker dies', function(done) {
    this.write('brian')
    this.write('aaron')
    this.write('shelley', true)
    var worker1Domain = null
    var worker2Domain = null
    var worker1 = pop(this.stream, function(obj, next) {
      assert(process.domain, 'missing a domain')
      worker1Domain = process.domain
      next(new Error('I always throw an error'))
    })

    var count = 0
    var worker2 = pop(this.stream, function(obj, next) {
      assert(process.domain, 'missing a domain')
      if(!worker2Domain) {
        worker2Domain = process.domain
      }
      if(worker1Domain) {
        assert(worker1Domain != process.domain, 'worker1 domain should differ from worker2 domain')
      }
      assert.equal(worker2Domain, process.domain)
      count++
      if(obj.name === 'shelley') {
        assert.equal(count, 3)
        return done()
      }
      next()
    })

    worker1.on('error', function(err) {
      assert.equal(err.message, 'I always throw an error')
      worker1.stream.unshift(worker1.item)
      worker1.pause()
      setTimeout(function() {
        worker1.resume()
      }, 5)
    })
  })
})
