'use strict'

var chai = require('chai')
var expect = chai.expect
var helper = require('../../lib/agent_helper')
var ParsedStatement = require('../../../lib/db/parsed-statement')
var Transaction = require('../../../lib/transaction')


function makeSegment(options) {
  var segment = options.transaction.trace.root.add('MongoDB/users/find')
  segment.setDurationInMillis(options.duration)
  segment._setExclusiveDurationInMillis(options.exclusive)
  segment.host = 'localhost'
  segment.port = 27017

  return segment
}

function makeRecorder(collection, operation) {
  var statement = new ParsedStatement('MongoDB', operation, collection)
  return statement.recordMetrics.bind(statement)
}

function recordMongoDB(segment, scope) {
  makeRecorder('users', 'find')(segment, scope)
}

function record(options) {
  if (options.apdexT) options.transaction.metrics.apdexT = options.apdexT

  var segment = makeSegment(options)
  var transaction = options.transaction


  transaction.finalizeNameFromUri(options.url, options.code)
  recordMongoDB(segment, options.transaction.name)
}

describe("record ParsedStatement with MongoDB", function () {
  var agent
  var trans


  beforeEach(function () {
    agent = helper.loadMockedAgent()
    trans = new Transaction(agent)
  })

  afterEach(function () {
    helper.unloadAgent(agent)
  })

  describe("when scope is undefined", function () {
    var segment

    beforeEach(function () {
      segment = makeSegment({
        transaction : trans,
        duration : 0,
        exclusive : 0
      })
    })

    it("shouldn't crash on recording", function () {
      expect(function () { recordMongoDB(segment, undefined); }).not.throws()
    })

    it("should record no scoped metrics", function () {
      recordMongoDB(segment, undefined)

      var result = [
        [{name: "Datastore/operation/MongoDB/find"},
         [1, 0, 0, 0, 0, 0]],
        [{name: "Datastore/allWeb"},
         [1, 0, 0, 0, 0, 0]],
        [{name: "Datastore/MongoDB/allWeb"},
         [1, 0, 0, 0, 0, 0]],
        [{name: "Datastore/MongoDB/all"},
         [1, 0, 0, 0, 0, 0]],
        [{name: "Datastore/all"},
         [1, 0, 0, 0, 0, 0]],
        [{name: "Datastore/statement/MongoDB/users/find"},
         [1, 0, 0, 0, 0, 0]],
      ]

      expect(JSON.stringify(trans.metrics)).equal(JSON.stringify(result))
    })
  })

  describe("with scope", function () {
    it("should record scoped metrics", function () {
      record({
        transaction : trans,
        url         : '/test',
        code        : 200,
        apdexT      : 10,
        duration    : 30,
        exclusive   : 2,
      })

    var result = [[
        {name: 'Datastore/operation/MongoDB/find'},
        [1, 0.03, 0.002, 0.03, 0.03, 0.0009]
      ], [
        {name: 'Datastore/allWeb'},
        [1, 0.03, 0.002, 0.03, 0.03, 0.0009]
      ], [
        {name: 'Datastore/MongoDB/allWeb'},
        [1, 0.03, 0.002, 0.03, 0.03, 0.0009]
      ], [
        {name: 'Datastore/MongoDB/all'},
        [1, 0.03, 0.002, 0.03, 0.03, 0.0009]
      ], [
        {name: 'Datastore/all'},
        [1, 0.03, 0.002, 0.03, 0.03, 0.0009]
      ], [
        {name: 'Datastore/statement/MongoDB/users/find'},
        [1, 0.03, 0.002, 0.03, 0.03, 0.0009]
      ], [
        {name: 'Datastore/statement/MongoDB/users/find', scope: 'WebTransaction/NormalizedUri/*'},
        [1, 0.03, 0.002, 0.03, 0.03, 0.0009]
      ]]

      expect(JSON.stringify(trans.metrics)).equal(JSON.stringify(result))
    })
  })

  it("should report exclusive time correctly", function () {
    var root   = trans.trace.root
      , parent = root.add('Datastore/statement/MongoDB/users/find',
                          makeRecorder('users', 'find'))
      , child1 = parent.add('Datastore/statement/MongoDB/users/insert',
                            makeRecorder('users', 'insert'))
      , child2 = child1.add('Datastore/statement/MongoDB/cache/update',
                            makeRecorder('cache', 'update'))


    root.setDurationInMillis(  32,  0)
    parent.setDurationInMillis(32,  0)
    child1.setDurationInMillis(16, 11)
    child2.setDurationInMillis( 5,  2)

    var result = [[
      {name: 'Datastore/operation/MongoDB/find'},
        [1, 0.032, 0.011, 0.032, 0.032, 0.001024]
    ], [
      {name: 'Datastore/allOther'},
      [3, 0.053, 0.027, 0.005, 0.032, 0.001305]
    ], [
      {name: 'Datastore/MongoDB/allOther'},
      [3, 0.053, 0.027, 0.005, 0.032, 0.001305]
    ], [
      {name: 'Datastore/MongoDB/all'},
      [3, 0.053, 0.027, 0.005, 0.032, 0.001305]
    ], [
      {name: 'Datastore/all'},
      [3, 0.053, 0.027, 0.005, 0.032, 0.001305]
    ], [
      {name: 'Datastore/statement/MongoDB/users/find'},
      [1, 0.032, 0.011, 0.032, 0.032, 0.001024]
    ], [
      {name: 'Datastore/operation/MongoDB/insert'},
      [1, 0.016, 0.011, 0.016, 0.016, 0.000256]
    ], [
      {name: 'Datastore/statement/MongoDB/users/insert'},
      [1, 0.016, 0.011, 0.016, 0.016, 0.000256]
    ], [
      {name: 'Datastore/operation/MongoDB/update'},
      [1, 0.005, 0.005, 0.005, 0.005, 0.000025]
    ], [
      {name: 'Datastore/statement/MongoDB/cache/update'},
      [1, 0.005, 0.005, 0.005, 0.005, 0.000025]
    ]]

    trans.end(function(){
      expect(JSON.stringify(trans.metrics)).equal(JSON.stringify(result))
    })
  })
})
