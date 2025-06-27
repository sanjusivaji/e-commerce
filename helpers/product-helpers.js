
const { getDb } = require('../config/connection');
const collections = require('../config/collections');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const ipLoginAttempts = {};  // Object stores data of 'ip address','loginAttempt' etc for function 'validateLogin'.
const fs = require('fs');
const path = require('path');

module.exports = { 

  // For check 'email' is existed or not
    async checkEmailExists(email) {
      const db = getDb();
      const admin = await db.collection(collections.ADMIN_COLLECTION).findOne({ email });
      return !!admin; // 'findOne()' returns a 'document' but we need to return only 'true' or 'false'.
    },


  // Count all admins (super + sub)
  countAdmins: async () => {
    const db = getDb();
    return await db.collection(collections.ADMIN_COLLECTION).countDocuments(); // 'countDocuments()' returns 'no.of documents'(both 'super' and 'sub' admins) and using 'query' and 'options'(like 'limit', 'skip' etc)are optional in 'countDocuments();.
  },

  // Count only sub admins
  countSubAdmins: async () => {
    const db = getDb();
    return await db.collection(collections.ADMIN_COLLECTION).countDocuments({ role: 'sub' });  // 'countDocuments()' using 'query' ie it returns only 'role' 'sub' admin.
  },


  // For sending email
  sendOtpToEmail: async(email, otp) => {  
      const transporter = nodemailer.createTransport({ // Creates object contains service provider,sender email, password etc
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

    const mailOptions = {   // Content and structure of the email
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Admin Signup OTP',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; border: 1px solid #ddd; padding: 20px;">
        <img src="https://yourdomain.com/logo.png" alt="Your Logo" style="height: 50px; margin-bottom: 20px;">
        <h2 style="color: #333;">Verify Your Email</h2>
        <p style="font-size: 16px; color: #555;">Use the code below to complete your signup:</p>
        <div style="font-size: 24px; font-weight: bold; background: #f2f2f2; padding: 10px 20px; width: fit-content; margin: 20px 0;">
          ${otp}
        </div>
        <p style="font-size: 14px; color: #888;">If you didn’t request this, please ignore this email.</p>
      </div>
    `,
    };

    await transporter.sendMail(mailOptions); // 'sendMail()' used for sending email and returns 'Promise' object.
  },

  
  // Adding 'admin' data
    doSignup: async (data) => {
      const db = getDb();
      const hashedPassword = await bcrypt.hash(data.Password, 10); // Hashing 'password' '10' times stronger. 
    
      const newAdmin = {
        name: data.name,
        email: data.email,
        Password: hashedPassword,
        role: data.role || 'sub', // Using 'data.role'(ie 'super') if available,or use 'sub'. And below data are newly added, 'not' passing through the 'argument'.
        loginAttempts: 0,         
        lockUntil: null,
        passwordHistory: [hashedPassword], // New changed password put into the 'array', to prevent reuse the old password.
        passwordLastChanged: new Date()    // Set, last changed date and time of password for change it in each 6 months.
      };
    
      const result = await db.collection(collections.ADMIN_COLLECTION).insertOne(newAdmin); // Create a new document in collection with new '_id'.
      newAdmin._id = result.insertedId; // Adding 'document's '_id' into 'newAdmin' for avoid another 'query' for retrieve the '_id'.
      return newAdmin;
    },



// For login
validateLogin: async (email, password, ip) => {
  const db = getDb();
  
  const now = new Date();
  const ipData = ipLoginAttempts[ip];

  // If IP is locked period not finished, make 'locked:true'
  if (ipData?.lockUntil && ipData.lockUntil > now) {
    return {
      locked: true,
      message: 'Too many failed login attempts. Try again later.',
      lockUntil: ipData.lockUntil,
    };
  }

  // Check if admin exists and password is valid
  const admin = await db.collection(collections.ADMIN_COLLECTION).findOne({ email }); // 'findOne()' returns 'document' and 'email' is the 'query' and creates a 'js' object 'admin',contains data 'name','password','role','loginAttempts' etc.
  const isValidPassword = admin && await bcrypt.compare(password, admin.Password);  // 'password' is the string passes as 'argument' and 'admin.Password' is already stored password as hashed in database. And 'bcrypt.compare()' first hashed the 'string' 'password' and compare with 'admin.Password' for check the match.

  // If 'not admin' or 'not password' return the function
  if (!admin || !isValidPassword) {
    const attemptResult = await module.exports.handleFailedIP(ip, email); // Function returns 'locked:true' or 'false', 'remaining:' and 'lockUntil'.  
    
    return {
      error: 'Invalid username or password',
      remainingAttempts: attemptResult.remaining,
      locked: attemptResult.locked,
      lockUntil: attemptResult.lockUntil,
    };
  }

  // If login successful remove blocked ip
  delete ipLoginAttempts[ip];

  //  For change the password each '6' months
  const sixMonths = 6 * 30 * 24 * 60 * 60 * 1000;
  const passwordLastChanged = new Date(admin.passwordLastChanged);
  const expired = (Date.now() - passwordLastChanged.getTime()) > sixMonths; // Check,duration between 'current time' and 'passwordChanged' time is more than '6' months. 
  if (expired) return { passwordExpired: true, admin };

  return {
    admin: {             // Return the object 'admin', with only necessary fields.
      name: admin.name,
      role: admin.role,
    },
  };
},


  // Handle 'ip' in the condition of 'not admin' or 'not password'
  handleFailedIP: async(ip, email) =>{
    const now = new Date();
    //If 'ip' login in first time
    if (!ipLoginAttempts[ip]) {               // means 'if(!ipLoginAttempts.ip)' for access data dynamically, 'not' array.
      ipLoginAttempts[ip] = { attempts: 1 }; // Adds 'key and value' to 'ipLoginAttempts.ip'
    } else {
      ipLoginAttempts[ip].attempts += 1;    // 'else' case,ie already same 'ipLoginAttempts.ip' occurs, modifying the 'attempts' field.
    }

    const data = ipLoginAttempts[ip];
    const remaining = Math.max(0, 3 - data.attempts);  // 'Math.max(a,b)' returns large number and '3 - data.attempts' put inside 'Math.max()'.

    // If more than 3 wrong attempt occurs
    if (data.attempts > 3) { 
      data.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 mins
      module.exports.sendSecurityAlertEmail(email); // This custom function used for sending security alert email.
      return { locked: true, remaining: 0, lockUntil: data.lockUntil };
    }

    return { locked: false, remaining };
  },

    // For sending security alert email and invoke from 'handleFailedIP()' 
    sendSecurityAlertEmail: async (email) => {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
  
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Security Alert: Login Attempts',
        html: `<p>There have been multiple failed login attempts on your admin account. </p>`,
      };
  
      await transporter.sendMail(mailOptions);
    },
  



    // For changing the password, that expired
     changePassword: async(adminId, oldPassword, newPassword) => {
      const db = getDb();
      const admin = await db.collection(collections.ADMIN_COLLECTION).findOne({ _id: new ObjectId(adminId) }); // Used for retrieve stored password(ie 'admin.Password')
      if (!admin) return { error: 'Admin not found' };
  
      // Check it's a valid admin
      const isMatch = await bcrypt.compare(oldPassword, admin.Password); // 'oldPassword' represents the user typing password as 'string' and 'admin.Password' is hashed password stored in database and 'bcrypt.compare()', first 'hash' the 'string' password and then compare both.
      if (!isMatch) return { error: 'Incorrect current password' };
  
      // Check 'password' exist, to prevent reuse password
      const reused = await module.exports.isPasswordReused(newPassword, admin.passwordHistory); // Custom function returns 'true' or 'false'.
      if (reused) return { error: 'Do not reuse previous passwords' };
  
      const hashed = await bcrypt.hash(newPassword, 10);  // After 'two' condition check, now string 'newPassword', hashed to '10' round, for upadate the 'password'.
  
      await db.collection(collections.ADMIN_COLLECTION).updateOne(
                                                                  { _id: new ObjectId(adminId) },
                                                                  {
                                                                    $set: {
                                                                      Password: hashed,
                                                                      passwordLastChanged: new Date(),
                                                                    },
                                                                    $push: {                                          // '$slice:-2' keeps 'last' '2' items and '$slice:2' keeps 'first' '2' items and '$each' requires an 'array'. And '$slice' only works with '$push' and '$each' and '$push:{arrayField: {$each: [array],$slice:number}}' is the 'syntax' and result is data of 'array'(ie 'hashed')pushed into 'arrayField'(ie 'passwordHistory'). 
                                                                      passwordHistory: { $each: [hashed], $slice: -2 }
                                                                    }
                                                                  }
                                                                );
  
      return { success: true };
    },

    isPasswordReused: async(newPassword, passwordHistory = []) => {  // 'newPassword' is the changing string password typed by user and 'passwordHistory' is the 'array' already stored in database, and in 'for...of' loop,'bcrypt.compare()', first hashing the 'string' password and then each 'item'(ie hashed 'password')compare for check the match.
      for (const item of passwordHistory) {
        const match = await bcrypt.compare(newPassword, item);
        if (match) return true;
      }
      return false;
    },


    // Retrieve all products for admin
    getAllProducts: async () => {
      try {
        const db = getDb();
        const products = await db.collection(collections.PRODUCT_COLLECTION).find().toArray();  // Retrieve all documents and convert 'cursor' into 'array', upto '1000' documents, '.toArray()' is enough.
        return products; 
      } catch (err) {
        console.error(" Error fetching products from Mongo db in product-helper:", err);
        throw err;
      }
    }, 


  
  
  // For adding product
    addProduct: async (product) => {
        try {
            const db = getDb();
            product.discount = parseInt(product.discount) || 0;  // If 'discount' is 'not' added, make it '0'.
            const result = await db.collection(collections.PRODUCT_COLLECTION).insertOne(product); 
            
            return result.insertedId.toString(); // 'insertId' is like 'new ObjectId('6...)', so we convert it into 'string'.
        } catch (err) {
            console.error("Error inserting product:", err);
            throw err;
        }
    },


    // For uploading image
    updateImages: async (productId, imagePaths) => {
        try {
          const db = getDb();
          await db.collection(collections.PRODUCT_COLLECTION).updateOne(
                                                                          { _id: new ObjectId(productId) },
                                                                          { $set: { images: imagePaths } }  // 'images' is the 'arrayFiedl' and update 'file name'(not actual image file) of each document(ie 'image') into 'image' field. 
                                                                        );
        } catch (err) {
          console.error("Error updating images:", err);
          throw err;
        }
      },

      
      // For uploading video
      updateVideo: async (productId, videoPath) => {
        try {
          const db = getDb();
          await db.collection(collections.PRODUCT_COLLECTION).updateOne(
                                                                          { _id: new ObjectId(productId) },
                                                                          { $set: { video: videoPath } }  // updating video filename
                                                                        );
        } catch (err) {
          console.error("Error updating video:", err);
          throw err;
        }
      },
      

  // For delete product from admin home page    
  deleteProduct : async (proId) => {
        try {
          const db = getDb();
          const productObjectId = new ObjectId(proId);

          // Find the 'product' docuement to get image filenames
          const product = await db.collection(collections.PRODUCT_COLLECTION).findOne({ _id: productObjectId });
          if (!product) return false; 

          // Delete the product document
          const result = await db.collection(collections.PRODUCT_COLLECTION).deleteOne({ _id: productObjectId });

          if (result.deletedCount > 0) {                                    // 'deleteCount' is return by 'deleteOne()'.
            await db.collection(collections.CART_COLLECTION).updateMany(
                                                                          {}, // For match all documents(ie all 'user's cart)
                                                                          { $pull: { products: { productId: productObjectId } } }  // pull/remove 'document' matching with 'productId',from 'products' arrayField in 'cart' collection, and if we use 'deleteOne()' it'll remove entire 'arrayField'.
                                                                        );

            // Delete  image 'files' from /public/images directory
            if (Array.isArray(product.images)) {                                     // Check 'product.image' is array
              for (const filename of product.images) {
                  const cleanFilename = filename.replace(/^images[\\/]/, '');        // 'replace()' used for replacing the matching 'string',matching starts with 'images'(because file starts with 'images' and 'public/images' also has images, so because of '2' 'images' we can't find correct path) and also matching '/'(for 'macOs') or '\'(for 'windows')and 'replacing' with ''(ie 'empty string').
                  const fullPath = path.join(__dirname, '../public/images', cleanFilename); // Gives path for image 
                fs.unlink(fullPath, (err) => {                                       // 'fs.unlink()' is the 'node.js' method, deletes the image file from folder, asynchronously
                  if (err) {
                    console.error(`Error deleting ${filename}:`, err);
                  }
                });
              }
            };
        
          // Delete video files from 'public/videos' folder
          const videoPath = product.video;
          if (videoPath) {
            const cleanVideoName = videoPath.replace(/^videos[\\/]/, ''); // Remove 'videos/' or 'videos\'
            const fullPath = path.join(__dirname, '../public/videos', cleanVideoName);

            fs.unlink(fullPath, (err) => {
              if (err) {
                console.error(`Error deleting video ${videoPath}:`, err);
              }
            });
          };

            return true;
          } else {
            return false; // Product wasn't deleted
          }
        } catch (err) {
          console.error('Error deleting product:', err);
          throw err;
        }
  },


      // For editing the product
      getProductById: async (proId) => {
        try {
            const db = getDb();
            return await db.collection(collections.PRODUCT_COLLECTION).findOne({ _id: new ObjectId(proId) });  // Retrieve document of 'editing product'.
        } catch (err) {
            console.error("Error fetching product by ID:", err);
            throw err;
        }
     },


     // For update edited field of product
     updateProduct: async (proId, updatedData) => {
        const db = getDb();
        await db.collection(collections.PRODUCT_COLLECTION).updateOne(                                 // Updating document
                                                                        { _id: new ObjectId(proId) },
                                                                        {
                                                                            $set: {
                                                                                name: updatedData.name,
                                                                                category: updatedData.category,
                                                                                description: updatedData.description,
                                                                                price: parseInt(updatedData.price),
                                                                                discount: parseInt(updatedData.discount) || 0,
                                                                                taxRate: parseInt(updatedData.taxRate),
                                                                                inStock: updatedData.inStock === "true"
                                                                            }
                                                                        }
                                                                      );
    },


    // Update image filename of editing product
    updateProductImages: async (proId, imageFilenames) => { 
        const db = getDb();
        const imagePaths = imageFilenames.map(item => 'images/' + item);  // 'imageFilenames' is an 'array' and addding each 'file' name in the 'imageFilenames', with string 'images/', because starting with name 'image' is more reusable, and 'map()' returns a new array.
        return db.collection(collections.PRODUCT_COLLECTION).updateOne(
                                                                        { _id: new ObjectId(proId) },
                                                                        { $set: { images: imagePaths } } // Updating 'image' arrayField.
                                                                      );
      },
      
      // Update video filename of editing product
      updateProductVideo: async (proId, videoFilename) => { 
        const db = getDb();
        const videoPath = 'videos/' + videoFilename; 
        return db.collection(collections.PRODUCT_COLLECTION).updateOne(
                                                                        { _id: new ObjectId(proId) },
                                                                        { $set: { video: videoPath } }
                                                                      );
      },


      // Retrieve data of users and their orders
      getAllUsersWithOrders: async () => {
        const db = getDb();
      
        // Retrieve data of all 'users' and 'orders' from two different collection
        try{
        const cursor = await db.collection(collections.USER_COLLECTION).aggregate([                                       // It will retrieve all data of 'users' collection,because we don't use '$match'.
                                                                                        {
                                                                                          $lookup: {                           // '$lookup' stage retrieve data from 'orders' collection.
                                                                                            from: collections.ORDERS_COLLECTION, 
                                                                                            localField: '_id',
                                                                                            foreignField: 'userId',
                                                                                            as: 'orders'                          // Creates new arrayField.
                                                                                          }
                                                                                        }
                                                                                      ]);
                                                                                      const userAndOrder = []; 
                                                                                      for await (const item of cursor) {
                                                                                        userAndOrder.push(item);
                                                                                      }
                                                                                  
                                                                                      return userAndOrder;
                                                                                    } catch (err) {
                                                                                      console.error('Error in searchProducts:', err);
                                                                                      throw err;
                                                                                    };
                                                                                      
      
      
      },


// Retrieve data 'users' if at least one 'order'
userWithOrderPlaced: async () => {
    const db = getDb();
  
    const cursor = await db.collection(collections.USER_COLLECTION).aggregate([
      {
        $lookup: {
          from: collections.ORDERS_COLLECTION,
          localField: '_id',
          foreignField: 'userId',
          as: 'orders'            // Creates arrayField, contains all data of 'orders' collection like 'address' and 'products' details.
        }
      },
      {
        $match: {
          "orders.0": { $exists: true }   // In this stage only matching 'orders' arrayField will retrieve, and 'orders.0' represent 'first' element in the arrayField, and '$exists:true' checks value is exists.
        }
      },
      {
        $project: {         // Projecting only necessary fields
          name: 1,
          email: 1,
          orders: 1,
          refundStatus:1,  // This field created only after cancel the order and also creates the field like 'refundInitiatedDate','refundStatus', 'adminMessage' etc.
        }
      }
    ]);
  
    const orderItems = [];
    for await (const item of cursor) {
      orderItems.push(item);
    };
    return orderItems;   
  },






 
    // Retrieve reviews,products details from 'orders' and 'reviews' collection,based on both 'orderId' and 'userId'.
    getOrderWithDeliveryAndReview: async (orderId) => {
      const db = getDb();
      const order = await db.collection(collections.ORDERS_COLLECTION).aggregate([                                                   // We should retrieve also data of 'orders' collection because we should display it in 'order-details'(for 'Delivered' section) page and '$match' used for matching document.
                                                                                  { $match: { _id: new ObjectId(orderId) } },      
                                                                                                                                                         
                                                                                  {
                                                                                    $lookup: {                                      // '$lookup' stage is used for retrieve data from both outer collection and same collection(that running 'aggregation pipeline'), by using 'foriegnField' and 'localField',and put all data into the 'arrayField'(ie '$as:'). But here we retrieve data of one collection(ie 'reviews')with two matching conditions of 'orders' collection and 'reviews' collection for retrieve all reviews.
                                                                                      from: collections.REVIEWS_COLLECTION,
                                                                                      let: { userId: '$userId' },                   // Creates a 'let' 'variable' with value of 'user id' from 'reviews' collection.
                                                                                      pipeline: [                                   // 'pipeline' used for creates a 'mini pipeline', ie it acts like a container,it helps to use another stages(ie '$match') inside '$lookup'.
                                                                                        {
                                                                                          $match: {                                 // '$match' used for check matching field,but it only allows check the matching of same collection(but here we want to check both, 'oreders' and 'reviews' collection based on 'userId'), so we use '$expr' for check 'dynamic' comparison('dynamic comparison' in 'aggregation' means check matching with two collection).
                                                                                                    $expr: {                        // '$userId' represent 'user id' of 'reviews' collection(we can directly use 'userId' of 'reviews' collection because 'lookup' pipeline running on 'reviews' collection)and '$$userId' represents 'user id' of outer collection 'orders',and outer collection's field cannot directly accessable, so we first assign it in a 'let' variable and use '$$'(ie inside 'map' or 'filter' etc with 'variable' should use two '$$'), and here retrieve 'all' reviews of 'reviews' collection based on 'userId' and below we filtering it, ie we only take 'reviews' of  this reviews based on 'productId').                                                                                                                                                                                                                                         
                                                                                                            $eq: ['$userId', '$$userId'] 
                                                                                                    }
                                                                                          }
                                                                                        }
                                                                                      ],
                                                                                      // localField:'_id',
                                                                                      // foreignField: 'userId', 
                                                                                      as: 'allReviews'
                                                                                    }
                                                                                  },
                                                                            
                                                                                  { $unwind: '$products' },                        // Unwind 'products' arrayField in the 'orders' collection(that 'matching' document retrieved above), for add unique field to particular document,based on product '_id'.
                                                                            
                                                                                  {
                                                                                    $addFields: {                                  // '$addFields' stage is used for adding a new field(ie 'reviewForProduct')or modify existing field.
                                                                                      reviewForProduct: {
                                                                                                          $arrayElemAt: [          // '$arrayElemAt' works with a 'arrayField' and returns a 'document' '$arrayElemAt: array,0' is the syntax and instead we can use '$first'(it returns also a 'first document',but '$first' can use with any other data type and return same data type,but '$arrayElemAt' only works with 'array')
                                                                                                              {
                                                                                                                $filter: {         // '$filter' works with 'arrayField'(ie '$allReviews')and returns a new array, '$filter: {input:'arrayField',as:'r', cond:{$eq:[checkTheCondition]}}' is the 'syntax', and 'r' is the 'variable' represent just like 'item' in a loop.  
                                                                                                                  input: '$allReviews',  // arrayField creates in 'lookup' stage
                                                                                                                  as: 'r',       
                                                                                                                  cond: {$eq: ['$$r.productId', { $toObjectId: '$products._id' } ]  // We filtering reviews of 'product' that only in that particular 'orders'. Ie 'productId' is the 'product id' of 'allreviews' arrayField(it is a 'ObjectId' retrieve from MongoDb) and 'r' is the variable(before a variable inside 'filter' or 'map' etc put two '$$') and '$products._id'(stored as a 'string' in MongoDb)from 'products' arrayField in 'orders' collection',ie both 'id' 'type' is different,so for comparison, convert into 'string' by 'toString:$$r.productId' or convert into 'ObjectId',ie '$toObjectId: $products._id'.
                                                                                                                                                              
                                                                                                                        }
                                                                                                                },
                                                                                                              },
                                                                                                            0
                                                                                                          ]
                                                                                                        }
                                                                                    }
                                                                                  },
                                                                            
                                                                                  {
                                                                                    $addFields: {
                                                                                      'products.review': '$reviewForProduct'    // Before this,we get document for 'each' product like "{_id:...,address:{_id:...,userId:..,fullName:...,..},products:{_id:...,name:...,},allReviews:[...],reviewForProduct:{rating:.., comment:...}}", but after this '$reviewForProduct' document assign into 'products'(ie 'reviews' document place inside 'products' document and when we retrieve it in 'js' we get 'reviews' object inside 'products' object, ie 'products.reviews').
                                                                                    }
                                                                                  },
                                                                            
                                                                                  {
                                                                                    $group: {                                  // Merging/grouping all prouducts document into one,by iterate over all documents.
                                                                                      _id: '$_id',
                                                                                      userId: { $first: '$userId' },           // We only need 'one'(ie 'first')value,because 'userId' in other documents is same and '$first' returns 'first' value of that data type(ie here it returns 'string' and if it works in 'array' it returns an 'array').
                                                                                      address: { $first: '$address' },
                                                                                      totalAmount: { $first: '$totalAmount' },
                                                                                      paymentMethod: { $first: '$paymentMethod' },
                                                                                      status: { $first: '$status' },
                                                                                      date: { $first: '$date' },
                                                                                      products: { $push: '$products' },       // We want all 'products' document('not' only first)and '$push' create or modify an 'arrayField' and '$group' iterate all documents and inside it '$push' put all products document into new 'arrayField'.    
                                                                                  
                                                                                    }
                                                                                  }
                                                                                ]).toArray();                                  // Retrieve data/document of one user at same time,so 'toArray()' is enough.
                                                                            
                                                                                return order[0] || null;                       // Aggregation returns a 'cursor' and we turned into an 'array' and it contains each product's documents ie same 'address' document,same 'total price' like data, but all data includes '0'th index.
    },




    // Admin reply for users review
    addAdminReply: async ({ orderId, productId, adminReply }) => {
      const db = getDb();
      const reviewsCollection = db.collection(collections.REVIEWS_COLLECTION);
  
      const result = await reviewsCollection.updateOne(
        { productId: new ObjectId(productId), orderId: new ObjectId(orderId) }, // Matching two condition
        { $set: { adminReply, adminReplyDate: new Date() } } // Add two new fields
      );
  
      return result.modifiedCount > 0;
    },



    // Updating delivery status
    updateOrderStatus: async(orderId, status, statusDate) => {
      try {
        const db = getDb();
        
        const order = await db.collection(collections.ORDERS_COLLECTION).findOne({ _id: new ObjectId(orderId) });
        if (!order) throw new Error('Order not found');
        
        // Adding date, based on status to each product
        const updatedProducts = order.products.map(item => {                                                             // 'map()' iterate over 'products' arrayField in the 'order' object.
                                                                if (status === 'Placed') item.placedDate = statusDate;   // Assign 'statusDate'(ie 'parameter')into new 'field' into each 'item'(ie product),and adding 'delivery date' and 'status' to each prodcut,helps to deliver each product seperately,if we want.
                                                                if (status === 'Shipped') item.shippedDate = statusDate;
                                                                if (status === 'Out for Delivery') item.outForDeliveryDate = statusDate;
                                                                if (status === 'Delivered') item.deliveredDate = statusDate;
                                                          
                                                                item.deliveryStatus = status;                            // Adds 'status' into new field.
                                                                //item.status = status;
                                                                return item;
                                                              });
    
        // Add 'updatedProducts' array into database
        const result = await db.collection(collections.ORDERS_COLLECTION).updateOne(
                                                                                    { _id: new ObjectId(orderId) },
                                                                                    {
                                                                                      $set: {
                                                                                        products: updatedProducts,
                                                                                        status:status,                                                                     
                                                                                      }
                                                                                    }
                                                                                  );
    
        if (result.matchedCount === 0) {
          throw new Error('Order not found or no changes made');
        }
    
        return { success: true, message: 'Order status updated successfully',orderId };
      } catch (err) {
        throw new Error('Error updating order status: ' + err.message);
      }
    },




      // When user cancel the order, get cancel date for admin
      getRefundDateByOrderId: async (orderId) => {
        const db = getDb();
      const order = await db.collection(collections.ORDERS_COLLECTION).findOne(
                                                                                { _id: new ObjectId(orderId) },
                                                                                { projection: { products: 1 } } // Retrieve only 'products' arrayField
                                                                              );

      if (!order || !order.products || !order.products[0].refundInitiatedDate) {
        throw new Error("Refund date not found");
      }

      return order.products[0].refundInitiatedDate;  // Return 'refundInitiatedDate' of first 'document'(ie first product) in the 'products' arrayField,that inside 'order' object.
      },



      // For update pickupdate and message, and return both with refunddate
      setPickupDateAndMessage: async (orderId, pickupDate, message) => {
        const db = getDb();
        const objectId = new ObjectId(orderId);
      
        const order = await db.collection(collections.ORDERS_COLLECTION).findOne(
                                                                                  { _id: objectId },
                                                                                  { projection: { products: 1 } }  // Retrieve only 'products' arrayField
                                                                                );
      
        if (!order || !order.products || !order.products[0].refundInitiatedDate) {
          throw new Error("Refund (cancel) date not found for the products in this order.");
        }
      
        const cancelDate = new Date(order.products[0].refundInitiatedDate);  // Create 'date' object,'cancelDate' retrieved from first element(ie 'first product') of 'products' arrayField in 'order' object.
        const pickupDateObj = new Date(pickupDate);
      
        if (pickupDateObj <= cancelDate) {
          throw new Error("Pickup date must be after the cancel date.");
        }
      
        await db.collection(collections.ORDERS_COLLECTION).updateOne(
                                                                      { _id: objectId },
                                                                      {
                                                                        $set: {
                                                                          pickupDate: pickupDateObj,
                                                                          adminMessage: message
                                                                        }
                                                                      }
                                                                    );

      
       return {
                pickupDate: pickupDateObj,
                adminMessage: message
              };
      
      },
                 
      
    
      // For 'Refund completed'(from 'cancel-pickup-form' page)
      markRefundAsCompleted : async (orderId) => {
        try {
          const db = getDb();
          await db.collection(collections.ORDERS_COLLECTION).updateOne(
                                                                        { _id: new ObjectId(orderId) },
                                                                        {
                                                                          $set: {                     // Adding two new fields.
                                                                            refundStatus: "Completed",
                                                                            refundCompletedDate: new Date()
                                                                          }
                                                                        }
                                                                      );
        } catch (error) {
          throw new Error('Failed to update refund status: ' + error.message);
        }
        return {success:true}
      },



      // For retrieve 'shipping cost' and 'admin address'
      getShippingCost: async () => {
        try {
          const db = getDb();
          const settings = await db.collection(collections.INVOICE_SETTINGS).find().toArray();

          return settings;
        } catch (err) {
          throw err;
        }
      },


      // Add or update 'admin address' and 'shipping cost'
      setDeliveryAndAdddress: async (invoiceData) => {
        try {
          const db = getDb();
      
          const dataToSave = {
            shippingCost: parseInt(invoiceData.shippingCost),
            promotionDiscount: parseInt(invoiceData.promotionDiscount),
            companyName: invoiceData.companyName,
            road: invoiceData.road,
            place: invoiceData.place,
            city: invoiceData.city,
            pincode: invoiceData.pincode,
            state: invoiceData.state,
            nation: invoiceData.nation,
            phone: invoiceData.phone,
            email: invoiceData.email,
            gstin: invoiceData.gstin,
          };
      
          // Replace existing document or insert if none exists
          await db.collection(collections.INVOICE_SETTINGS).replaceOne(                     // 'replaceOne(matchingCondition,replacingDocument)' is the syntax 
                                                                        {},                 //  It will match if only 'one' document will exist(and if we want extra field use like '{key:value'}).
                                                                        dataToSave,         //  Replacing document
                                                                        { upsert: true }    // 'upsert:true' creates a new document,if not exists.
                                                                      );
      
          return { success: true };
        } catch (err) {
          console.error('Error in setdeliveryandadddress:', err);
          throw err;
        }
      },


      // For retrieve data to display 'Tax Report'
      getDeliveredOrdersWithTax: async () => {
        const db = getDb();
      
        const orders = await db.collection(collections.ORDERS_COLLECTION).find({ status: 'Delivered', deliveryStatus: {$ne:'Cancelled'} }).toArray();  // Check two matching conditions and 'find()' retuns an 'cursor' convert into array
     
        const enrichedOrders = [];
        let grandTotalTax = 0;      
      
        for (const item of orders) {
              const productIds = item.products.map(item => new ObjectId(item._id ));  // Iterate 'products' array for retrieve each products '_id'
              const productDetails = await db.collection(collections.PRODUCT_COLLECTION).find({ _id: { $in: productIds } }).toArray();  // 'productsId' is 'product id' of 'orders' collection and if it match 'any'(ie '$in' used for match 'any' value in the array)value/product document, in 'products' collection and it returns an array contains 'documents' of each products.
          
              let totalTax = 0;
          
              const updatedProducts = item.products.map(p => {                        // 'products' represent array in 'orders'(ie iterate in 'for loop') and 'map()' return an array.
                  const dbProduct = productDetails.find(prod => prod._id.toString() === ( p._id).toString()); // 'prod._id' represent 'product id' in 'product' collection and 'p._id' represent 'product id' in the 'orders' collection,and after compare both, we get correct 'product' for retrieve 'taxRate','product name' like 'fields'.
                  
                  const taxRate = dbProduct?.taxRate ?? 0;
                  const price = parseFloat(p.decreasedPrice || p.price || 0); // fallback if decreasedPrice is missing
                  const quantity = p.quantity;
            
                  const taxPerUnit = (price * taxRate / 100);
                  const totalProductTax = taxPerUnit * quantity;
            
                  totalTax += totalProductTax; //  accumulate order total in 'map'
                  return {
                    ...p,
                    taxRate,
                    taxPerUnit: taxPerUnit.toFixed(2),
                    totalProductTax: totalProductTax.toFixed(2),
                    productName: dbProduct?.name || ''
                  };
          });
      
          grandTotalTax += totalTax;   // accumulate in 'for loop'.
      
          enrichedOrders.push({        // 'enrichedOrders' is the array we already declared, and 'push' is built-in 'js' method used for pushing/adding field(ie pushing an 'object' because of 'push({...})')and return a lengthy array.
            _id: item._id,
            userId: item.userId,
            date: item.date,
            paymentMethod: item.paymentMethod,
            address: item.address,     // An object
            products: updatedProducts, // An array
            totalTax: totalTax.toFixed(2)
          });
        }
      
        return {
          orders: enrichedOrders,
          grandTotalTax: grandTotalTax.toFixed(2)
        };
      },




};


