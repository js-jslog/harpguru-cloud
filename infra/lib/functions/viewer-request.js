// A CloudFront Function, run on every viewer request, on every behaviour,
// before the cache is checked. In order:
//
//   1. www.harpguru.com goes to the apex with a permanent redirect, keeping
//      the path and query string.
//   2. /t, /s and /e without their slash get it, the same way.
//   3. A widget page's path is mapped to the object that holds it:
//        /s/<anything>  -> /s/index.html, the one setup-link shell
//        /e/<anything>  -> /e/index.html, the one embed shell
//        /t/<slug>      -> /t/<slug>/index.html, that tuning's page
//      The query string is left alone. The page reads it after loading; the
//      cache ignores it.
//
// Everything else passes through, so the .well-known files are never
// redirected or rewritten. One function rather than two because a behaviour
// takes only one for viewer requests, and every behaviour needs step 1.
//
// Plain JavaScript for CloudFront's own runtime, cloudfront-js-2.0: no
// modules, no network, and under a millisecond of compute. CDK reads this file
// and inlines it into the template; nothing imports it.
function handler(event) {
  var request = event.request
  var uri = request.uri
  var host = request.headers.host ? request.headers.host.value : ''

  if (host === 'www.harpguru.com') {
    return redirect('https://harpguru.com' + uri + query(request.querystring))
  }
  if (uri === '/t' || uri === '/s' || uri === '/e') {
    return redirect(uri + '/' + query(request.querystring))
  }

  if (uri.indexOf('/s/') === 0) {
    request.uri = '/s/index.html'
  } else if (uri.indexOf('/e/') === 0) {
    request.uri = '/e/index.html'
  } else if (uri.indexOf('/t/') === 0) {
    var last = uri.slice(uri.lastIndexOf('/') + 1)
    if (last === '') {
      request.uri = uri + 'index.html'
    } else if (last.indexOf('.') === -1) {
      request.uri = uri + '/index.html'
    }
  }
  return request
}

function redirect(location) {
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: location } },
  }
}

// CloudFront hands the function each value still URL-encoded, so joining them
// back up needs no re-encoding.
function query(querystring) {
  var parts = []
  for (var key in querystring) {
    var param = querystring[key]
    var values = param.multiValue
      ? param.multiValue.map(function (v) {
          return v.value
        })
      : [param.value]
    values.forEach(function (value) {
      parts.push(value === '' ? key : key + '=' + value)
    })
  }
  return parts.length ? '?' + parts.join('&') : ''
}
