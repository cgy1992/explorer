var debug = require('debug')('explorer:router:admin')
var Promise = require('bluebird')
var unlinkAsync = Promise.promisify(require('fs').unlink)
var prettyBytes = require('pretty-bytes')

import {extend} from '../lib/utils.js'
import {User} from '../lib/users.js'
import {tree} from '../lib/tree.js'

function handleSystemError(req, res) {
  return function (err) {
    console.error(err)
    req.flash('error', err)
    return res.redirect('back')
  }
}

function validUser(req, res, next) {
  if(!req.body.username)
    return handleSystemError(req, res)('User is not valid')

  try {
    new User(req.body) 
  } catch(e) {
    console.error(e)  
    return handleSystemError(req, res)('User is not valid')
  }

  return next()
}

function isAdmin(req, res, next) {
  if(!req.user.admin)
    return res.status(403).send('Forbidden')

  return next()
}

var Admin = function(app) {
  let admin = require('express').Router()
  let config = app.get('config')
  admin.use(isAdmin)

  admin.get('/', function(req, res) {

    if(config.remove.method !== 'mv')
      return res.renderBody('admin', {users: req.users.users, remove: false, trash_size: '0 B'})

    tree(config.remove.trash, {maxDepth: 1})
    .then(function(tree) {

      if(tree.tree.length == 0)
        return res.renderBody('admin', {users: req.users.users, remove: true, trash_size: '0 B'})
        
      let size = tree.tree.reduce(function(a, b) { return a.size + b.size })

      return res.renderBody('admin', {users: req.users.users, remove: true, trash_size: prettyBytes(size)})
    })

  })

  admin.post('/trash', function(req, res) {
    tree(config.remove.trash, {maxDepth: 1})
    .then(function(tree) {
      Promise.all(tree.tree.map(function(e) {
        return unlinkAsync(e.path)
      }))
      .then(function() {
        return res.redirect('back')
      })
      .catch(handleSystemError)
    })
     
  })

  admin.get('/create', function(req, res) {
    return res.renderBody('admin/user/create.haml')
  })

  admin.get('/update/:username', function(req, res) {
    let u = req.users.get(req.params.username)

    if(!u) {
      return handleSystemError(req,res)('User not found')
    }

    return res.renderBody('admin/user/update.haml', {user: u})
  })

  admin.get('/delete/:username', function(req, res) {
    req.users.delete(req.params.username)
    .then(function() {
      req.flash('info', `User ${req.params.username} deleted`)
      return res.redirect('/a') 
    })
    .catch(handleSystemError(req, res))
  })

  admin.post('/users', validUser, function(req, res) {

    if(req.users.get(req.body.username)) {
      return handleSystemError(req, res)('User already exists')
    }

    return new User(req.body) 
    .then(function(user) {
      return user.generateKey()
    })
    .then(function(user) {
      return req.users.put(user)
      .then(function() {
        req.flash('info', `User ${user.username} created`)
        return res.redirect('/a')
      })
    })
    .catch(handleSystemError(req, res))
  })

  admin.put('/users', function(req, res) {
    let u = req.users.get(req.body.username)

    if(!u) {
      return handleSystemError(req,res)('User not found')
    }
    
    let user = req.body

    for(var i in u) {
      // waiting for private class variable o/
      if(typeof u[i] !== 'function') {
        u[i] = user[i]
      }
    }
    
    user = new User(u, !!req.body.password)
    .then(function(user) {
      if(''+user.key === '1') 
        return user.generateKey()

      return Promise.resolve(user)
    })
    .then(function(user) {
      return req.users.put(user)
      .then(function() {
        req.flash('info', `User ${user.username} updated`)
        return res.redirect('/a')
      })
    })
    .catch(handleSystemError(req, res))
  })

  app.use('/a', admin)

}

export {Admin}
