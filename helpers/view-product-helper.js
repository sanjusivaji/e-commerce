const { getDb } = require('../config/connection');
const collections = require('../config/collections');
const { ObjectId } = require('mongodb');


module.exports = {


    // For searching products based on user input in search bar
         searchProducts: async ( query) => {
           const db = getDb();
           try {
             if (!query) return [];
         
             const cursor = await db.collection(collections.PRODUCT_COLLECTION).aggregate([
               {
                 $match: {
                   name: { $regex: query, $options: 'i' } // Matching with 'regex' operator.
                 }
               },
               
               { $limit: 10 }, // Limiting the return documents. 
   
               {
                 $lookup: {       // Retrieve data from 'reviews' collection.
                   from: collections.REVIEWS_COLLECTION,
                   localField: '_id',
                   foreignField: 'productId',
                   as: 'reviews'
                 }
               },
              
                {
               $addFields: {  // Adding '3' new fields and one is 'arrayField'. 
                 avgRating: { $avg: "$reviews.rating" },           
                 reviewCount: { $size: "$reviews" },
                 reviews: {
                   $map: {
                     input: "$reviews",
                     as: "r",
                     in: {
                           userId: "$$r.userId",
                           orderId: "$$r.orderId",
                           rating: "$$r.rating",
                           title: "$$r.title",
                           review: "$$r.review",
                           image: "$$r.image",
                           adminReply: "$$r.adminReply"
                         }
                   }
                 }
               }
             },
   
               {
                 $project: {  // Projecting necessary fields only
                   name: 1,
                   description:1,
                   category: 1,
                   price: 1,
                   discount: 1,
                   inStock: 1,
                   images: 1,
                   video:1,
                   avgRating: 1,
                   reviewCount: 1,
                   reviews:1
                 }
              }
             ]);
             const cartItems = []; 
             for await (const item of cursor) {
                 cartItems.push(item);
             }
         
             return cartItems;
           } catch (err) {
             console.error('Error in searchProducts:', err);
             throw err;
           }
         },
   
   
       // For get compleate data of  all products
       getAllProducts: async () => {
         const db = getDb();
         try {
           const cursor = await db.collection(collections.PRODUCT_COLLECTION).aggregate([
             {
               $lookup: {
                 from: collections.REVIEWS_COLLECTION,
                 localField: '_id',
                 foreignField: 'productId',
                 as: 'reviews'
               }
             },
             {
               $addFields: {
                 avgRating: { $avg: "$reviews.rating" },
                 reviewCount: { $size: "$reviews" },
                 reviews: {
                   $map: {
                     input: "$reviews",
                     as: "r",
                     in: {
                           userId: "$$r.userId",
                           orderId: "$$r.orderId",
                           rating: "$$r.rating",
                           title: "$$r.title",
                           review: "$$r.review",
                           image: "$$r.image",
                           adminReply: "$$r.adminReply"
                         }
                   }
                 }
               }
             }
            ]);
           const cartItems = []; 
             for await (const item of cursor) {
                 cartItems.push(item);
             };
   
           return cartItems;
         } catch (err) {
           console.error('Error in getAllProducts with ratings:', err);
           throw err;
         }
       },
   
   
       // For 'count' of total products in the cart
         getCartCount: async (userId) => {
           try {
             const db = getDb();
             const result = await db.collection(collections.CART_COLLECTION).aggregate([
               { $match: { user: new ObjectId(userId) } },
               { $unwind: "$products" },  //  'products' arrayField into individual 'document'
               {
                 $group: {             // grouping all documents,for sum of 'qunatity', beyond '_id'.
                   _id: null,
                   totalQuantity: { $sum: "$products.quantity" }
                 }
               }
             ]).toArray();
         
             return result[0]?.totalQuantity || 0;
           } catch (err) {
             console.error("Aggregation error in getCartCount:", err);
             return 0;
           }
         },

     
         // For retrieving product data to display in 'Checkout' page
         getProductForBuyNow: async (proId) => {
                 try {
                     const db = getDb();
                     return await db.collection(collections.PRODUCT_COLLECTION).findOne({ _id: new ObjectId(proId) });
                 } catch (err) {
                     console.error("Error fetching product by ID:", err);
                     throw err;
                 }
              },
   
   
       // For 'Add to Cart' button       
     addToCart: async (proId, userId, quantity = 1) => {
       try {
         const db = getDb();
         const cartCollection = db.collection(collections.CART_COLLECTION);
         const usrId = new ObjectId(userId);
         const producId = new ObjectId(proId);
     
         // Checking if product exist or not by 'two' queries
         const productExists = await cartCollection.findOne({
                                                               user: usrId,
                                                               "products.productId": producId
                                                           });
     
         // If product exists, update 'quantity' of cart
         if (productExists) {
           await cartCollection.updateOne(
                                           { user: usrId, "products.productId": producId },  // 'two' queries for matching 'product'.
                                           { $inc: { "products.$.quantity": quantity } }  //'increasing' quantity of 'first' matching document.                                
                                         );
         // If product 'not' exists create new document
         } else {
           await cartCollection.updateOne(
                                           { user: usrId },
                                           { $push: { products: { productId: producId, quantity } } },  // Adds 'two fields' into document in the 'products' arrayField.
                                           { upsert: true } // Create new document.
                                         );
         }
     
         return { status: true };
       } catch (error) {
         console.error("Error in addToCart:", error);
         return { status: false, error };
       }
     },

}