const cookie = require('cookie');

const { SITE_PASSWORD } = process.env;
const COOKIE_NAME = 'site_auth';

module.exports = (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    if (!SITE_PASSWORD) {
        return res.status(500).json({ message: 'Site password is not configured on the server.' });
    }

    const { password } = req.body;

    if (password === SITE_PASSWORD) {
        const authCookie = cookie.serialize(COOKIE_NAME, 'true', {
            httpOnly: true,
            secure: process.env.NODE_ENV !== 'development',
            sameSite: 'strict',
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: '/',
        });

        res.setHeader('Set-Cookie', authCookie);
        return res.status(200).json({ message: 'Logged in successfully' });
    } else {
        return res.status(401).json({ message: 'Invalid password' });
    }
};
