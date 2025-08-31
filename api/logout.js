const cookie = require('cookie');

const COOKIE_NAME = 'site_auth';

module.exports = (req, res) => {
    const authCookie = cookie.serialize(COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'strict',
        expires: new Date(0), // Set expiry to a past date to delete the cookie
        path: '/',
    });

    res.setHeader('Set-Cookie', authCookie);
    res.status(200).json({ message: 'Logged out successfully' });
};
