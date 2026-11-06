// A CloudFront Function, run on every viewer request before the cache is
// checked. It sends www.harpguru.com to the apex with a permanent redirect,
// keeping the path and query string, and passes every other request through.
//
// Plain JavaScript for CloudFront's own runtime, cloudfront-js-2.0: no
// modules, no network, and under a millisecond of compute. CDK reads this file
// and inlines it into the template; nothing imports it.
function handler(event) {
  var request = event.request
  var host = request.headers.host ? request.headers.host.value : ''
  if (host !== 'www.harpguru.com') {
    return request
  }

  var parts = []
  for (var key in request.querystring) {
    var param = request.querystring[key]
    var values = param.multiValue
      ? param.multiValue.map(function (v) {
          return v.value
        })
      : [param.value]
    values.forEach(function (value) {
      parts.push(value === '' ? key : key + '=' + value)
    })
  }
  var query = parts.length ? '?' + parts.join('&') : ''

  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: {
      location: { value: 'https://harpguru.com' + request.uri + query },
    },
  }
}
