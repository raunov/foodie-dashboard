const cookie = require('cookie');

const { SITE_PASSWORD } = process.env;
const COOKIE_NAME = 'site_auth';

// Helper function to parse request body
async function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(e);
            }
        });
    });
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    if (!SITE_PASSWORD) {
        console.error('SITE_PASSWORD environment variable not set.');
        return res.status(500).json({ message: 'Site password is not configured on the server.' });
    }

    try {
        const { password } = await parseBody(req);
        console.log('Received login attempt.');

        if (password === SITE_PASSWORD) {
            console.log('Login successful.');
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
            console.warn('Invalid password attempt.');
            return res.status(401).json({ message: 'Invalid password' });
        }
    } catch (error) {
        console.error('Error parsing request body:', error);
        return res.status(400).json({ message: 'Invalid request body.' });
    }
};
