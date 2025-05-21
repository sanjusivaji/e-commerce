const { getDb } = require('../config/connection');
const collections = require('../config/collections');
const bcrypt = require('bcrypt');
const { ObjectId } = require('mongodb');


module.exports = {
    doSignup: (userData) => {
        return new Promise(async (res, rej) => {
            try {
                if (!userData.Password) {
                    console.log("Error: Password is missing");
                    return rej("Password is missing");
                }
    
                let db = getDb();
    
                // Using 'bcrypt' for hashing the password
                userData.Password = await bcrypt.hash(userData.Password, 10); 
                //console.log("Password hashed successfully");
    
                let result = await db.collection(collections.USER_COLLECTION).insertOne(userData);
    
                userData._id = result.insertedId;
                res(userData);
            } catch (error) {
                console.error("Error in doSignup:", error);
                rej(error);
            }
        });
    },


  checkEmailExists: async (email) => {
    try {
      const db = getDb();
      const user = await db.collection(collections.USER_COLLECTION).findOne({ email });
      return !!user;
    } catch (err) {
      throw new Error('Database error during email check');
    }
  },


};