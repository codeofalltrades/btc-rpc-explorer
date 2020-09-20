var os = require('os');
var path = require('path');
var url = require('url');

var btcUri = process.env.VEILEXP_VEILD_URI ? url.parse(process.env.VEILEXP_VEILD_URI, true) : { query: { } };
var btcAuth = btcUri.auth ? btcUri.auth.split(':') : [];

module.exports = {
	rpc: {
		host: btcUri.hostname || process.env.VEILEXP_VEILD_HOST || "127.0.0.1",
		port: btcUri.port || process.env.VEILEXP_VEILD_PORT || 58812,
		username: btcAuth[0] || process.env.VEILEXP_VEILD_USER,
		password: btcAuth[1] || process.env.VEILEXP_VEILD_PASS,
		cookie: btcUri.query.cookie || process.env.VEILEXP_VEILD_COOKIE || path.join(os.homedir(), '.veil', '.cookie'),
		timeout: parseInt(btcUri.query.timeout || process.env.VEILEXP_VEILD_RPC_TIMEOUT || 5000),
	},

	// optional: enter your api access key from ipstack.com below
	// to include a map of the estimated locations of your node's
	// peers
	// format: "ID_FROM_IPSTACK"
	ipStackComApiAccessKey: process.env.VEILEXP_IPSTACK_APIKEY,

	// optional: GA tracking code
	// format: "UA-..."
	googleAnalyticsTrackingId: process.env.VEILEXP_GANALYTICS_TRACKING,

	// optional: sentry.io error-tracking url
	// format: "SENTRY_IO_URL"
	sentryUrl: process.env.VEILEXP_SENTRY_URL,
};
