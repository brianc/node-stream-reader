var domains = require('domain')

module.exports = function(stream, cb) {
  var domain = domains.create()
  var paused = false

  var dispatch = function() {
    var item = stream.read()
    if(!item) return false;

    cb(item, readOne)
    return true
  }

  var readOne = function(err) {
    if(err) return domain.emit('error', err);
    if(paused) return;

    //stream could already have an item ready to be read
    if(dispatch()) return

    //if we couldn't read immediately, wait and try when the stream is readable
    stream.once('readable', function() {
      if(dispatch()) return
      readOne()
    })
  }

  setImmediate(domain.run.bind(domain, readOne))

  domain.pause = function() {
    paused = true
  }

  domain.resume = function() {
    paused = false
    setImmediate(readOne)
  }

  return domain
}

