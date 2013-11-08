var assert = require('assert')

var pop = require('../')


describe('read 1', function() {
  beforeEach(function() {
    this.stream = new require('stream').PassThrough({objectMode: true})
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
    this.stream.write({name: 'aaron'})
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
      this.stream.write({name: 'brian'})
      var worker = pop(this.stream, function(obj, next) {
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
      this.stream.write({name: 'brian'})
      this.stream.write({name: 'aaron'})
      this.stream.write({name: 'shelley'})
      var errorCount = 0
      var worker = pop(this.stream, function(obj, next) {
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
})
