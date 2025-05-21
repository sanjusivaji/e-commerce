const { getDb } = require('../config/connection');
const collections = require('../config/collections');
const bcrypt = require('bcrypt');
const { ObjectId } = require('mongodb');


module.exports = {
    doLogin: async (userData) => {
        try {
            console.log('Login attempt for:', userData.email);
            const db = getDb();
            const user = await db.collection(collections.USER_COLLECTION).findOne({ email: userData.email });
            if (!user || !user.Password) {
                console.log('User not found');
                return { status: false};
            }
            // Compare text password with 'hashed' password by using 'bcrypt.compare()'
            const passwordMatch = await bcrypt.compare(userData.Password, user.Password);
            if (passwordMatch) {
                console.log('Login successful');
                return { status: true,user };
            } else {
                console.log('Incorrect password');
                return { status: false};
            }
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    },

};