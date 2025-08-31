const cookie = require('cookie');

const COOKIE_NAME = 'site_auth';

function isAuthenticated(req) {
    const cookies = cookie.parse(req.headers.cookie || '');
    return cookies[COOKIE_NAME] === 'true';
}

module.exports = { isAuthenticated };
