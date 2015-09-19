#! /usr/bin/env node

var blessed = require('blessed')
var multicb = require('multicb')
var path    = require('path')
var pull    = require('pull-stream')
var ssbKeys = require('scuttlebot/node_modules/ssb-keys')
var config  = require('scuttlebot/node_modules/ssb-config/inject')(process.env.ssb_appname)

var createSbot   = require('scuttlebot')
  .use(require('scuttlebot/plugins/master'))
  .use(require('scuttlebot/plugins/gossip'))
  .use(require('scuttlebot/plugins/friends'))
  .use(require('scuttlebot/plugins/replicate'))
  .use(require('scuttlebot/plugins/blobs'))
  .use(require('scuttlebot/plugins/invite'))
  .use(require('scuttlebot/plugins/block'))
  .use(require('scuttlebot/plugins/local'))
  .use(require('scuttlebot/plugins/logging'))
  .use(require('scuttlebot/plugins/private'))

var keys = ssbKeys.loadOrCreateSync(path.join(config.path, 'secret'))

if(keys.curve === 'k256')
  throw new Error('k256 curves are no longer supported,'+
                  'please delete' + path.join(config.path, 'secret'))

var screen = blessed.screen({
  smartCSR: true,
  dockBorders: true
})

var feedList = blessed.list({    
  parent: screen,
  label: ' Feeds ',
  top: 0,
  right: 0,
  width: '100%',
  height: '100%',
  keys: true,
  vi: true,
  interactive: true,
  border: 'line',
  scrollbar: {
    ch: ' ',
    track: {
      bg: 'cyan'
    },
    style: {
      inverse: true
    }
  },
  invertSelected: false,
  style: {
    item: {
      hover: {
        bg: 'blue'
      }
    },
    selected: {
      fg: 'white',
      bg: 'blue',
      bold: true
    }
  }
})

var logView = blessed.log({
  parent: screen,
  hidden: true,
  scrollable: true,
  scrollbar: {
    ch: ' ',
    track: {
      bg: 'cyan'
    },
    style: {
      inverse: true
    }
  },
  input: true,
  keyable: true,
  keys: true,
  interactive: true,
  top: 0,
  right: 0,
  width: '100%',
  height: '100%',
  border: 'line'
})

screen.key(['escape', 'c'], function(ch, key) {
  logView.hide()
  screen.render()
})

screen.key(['q', 'C-c'], function(ch, key) {
  return process.exit(0)
})

createSbot.createClient({keys: keys})({port: config.port, host: config.host||'localhost', key: keys.id}, function (err, sbot) {
  if(err) throw err

  var done = multicb({ pluck: 1 })
  pull(sbot.latest(), pull.collect(done()))
  sbot.friends.all('follow', done())
  sbot.friends.all('flag', done())
  done(function (err, res) {
    if (err) throw err
    var feeds = res[0]
    feedList.setItems(feedsToListData.apply(null, res))
    screen.render()

    feedList.on('select', function (el, selected) {
      logView.setLabel(' Feed: ' + feeds[selected].id + ' ')
      logView.show()
      logView.focus()
      logView.content = ''
      pull(sbot.createUserStream({ id: feeds[selected].id }), pull.drain(
        function (msg) { logView.content += JSON.stringify(msg, null, 2) + '\n' },
        function (err) {
          if (err) throw err
          screen.render()
        }
      ))
    })
  })
})

function countInbounds (graph, id) {
  var n = 0
  for (var id2 in graph)
    if (graph[id2][id])
      n++
  return n
}

function feedsToListData (feeds, follows, flags) {
  feeds.sort(function (a, b) {
    return b.sequence - a.sequence
  })

  return feeds.map(function (f) {
    return f.id 
      + ' [seq: ' + f.sequence 
      + ' follows: ' + Object.keys(follows[f.id] || {}).length + '/' + countInbounds(follows, f.id)
      + ' flags: ' + Object.keys(flags[f.id] || {}).length + '/' + countInbounds(flags, f.id)
      + ']'
  })
}