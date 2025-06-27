const { getDb } = require('../config/connection');
const collections = require('../config/collections');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const nodemailer  = require('nodemailer');


module.exports = {



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
            $addFields: {           // Adding '3' new fields and one is 'arrayField'. 
                avgRating: { $avg: "$reviews.rating" },
                reviewCount: { $size: "$reviews" },
                reviews: {
                            $map: {
                                input: "$reviews",
                                as: "r",
                                in: {
                                    userId: "$$r.userId",
                                    usersName: "$$r.usersName",
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
        const allProducts = []; 
            for await (const item of cursor) {
              allProducts.push(item);
            };

        return allProducts;
        } catch (err) {
        console.error('Error in getAllProducts with ratings:', err);
        throw err;
        }
    },



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
               $addFields: {          // In the 'addFields' stage, adding '3' new fields and one is 'arrayField'. 
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
             const searchProducts = []; 
             for await (const item of cursor) {
              searchProducts.push(item);
             }
         
             return searchProducts;
           } catch (err) {
             console.error('Error in searchProducts:', err);
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
       
       
          
           // For display products in 'Cart' page
           getCartProducts: async (userId) => {
               try {
                  const db = getDb();
                  const cartCollection = db.collection(collections.CART_COLLECTION);
            
                  const cursor = await cartCollection.aggregate([
                     { $match: { user: new ObjectId(userId) } }, // Find user's cart
                     { $unwind: "$products" },  // 'products' arrayField into 'documents', for retrieve 'localField'
                     {
                        $lookup: {  // Retieve data from 'product' collection and create 'productDetails' arrayField.
                           from: collections.PRODUCT_COLLECTION,
                           localField: "products.productId",
                           foreignField: "_id",
                           as: "productDetails"
                        }
                     },
                     { $unwind: "$productDetails" }, // 'productDetails' arrayField into 'documents'.
                     {
                        $project: {      // 'Project' only necessary fields.
                           _id: "$productDetails._id",
                           name: "$productDetails.name",
                           price: { $toDouble: "$productDetails.price" },  // Convert 'string' into 'number' with 'decimal point' 
                           percentage: {$toInt: "$productDetails.discount"},  // Convert 'string' into 'number' without 'decimal point'
                           taxRate: {$toInt: "$productDetails.taxRate"},
                           image:{$cond: {if : { $isArray:"$productDetails.images" }, // Retrieve first image from 'productDetails.images' arrayField.                                      
                                          then: {$arrayElemAt: ["$productDetails.images",0]},
                                          else: null
                                   }
                               } ,
                           quantity: "$products.quantity", // Retrieved from 'cart' collection.
                       
                        }
                     }
                  ]);
       
                  const cartItems = []; 
                  for await (const item of cursor) {
                      //console.log('Processing item:', item);
                      cartItems.push(item);
                  }
            
                  if (!cartItems.length) {
                     return { status: false, message: "Cart is empty", products: [], subtotal: 0 };
                  } 
       
                  return { status:true, products:cartItems };
               } catch (error) {
                  console.error("Error in getCartProducts:", error);
                  return { status: false, error };
               }
            },
       
       
       
            // For update quantity in 'Cart' page
             updateCartQuantity: async (userId, productId, newQuantity) => {
               try {
                 const db = getDb();
                 const cartCollection = db.collection(collections.CART_COLLECTION);
           
                 const result = await cartCollection.updateOne({user: new ObjectId(userId), "products.productId": new ObjectId(productId)}, // For 'two' matches
                                                               { $set: { "products.$.quantity": newQuantity }}                              // For update quantity of 'first' matching document in the 'products' arrayField.                                     
                                                              );
           
                 if (result.modifiedCount === 0) {
                   return { success: false, message: "No product updated" };
                 }
           
                 return { success: true };
               } catch (error) {
                 console.error("Error updating cart quantity:", error);
                 return { success: false, error };
               }
             },
           
           
           // For 'Remove' button in the 'Cart' page
           removeFromCart: async (userId, productId) => {
               try {
                   const db = getDb();
                   const cartCollection = db.collection(collections.CART_COLLECTION);
           
                   await cartCollection.updateOne(
                       { user: new ObjectId(userId) },  // Match with 'userId'
                       { $pull: { products: { productId: new ObjectId(productId) } } } // Remove product from 'products' arrayField.
                   );
           
                   return { success: true };
               } catch (error) {
                   console.error("Error removing from cart:", error);
                   return { success: false, error };
               }
           },
       
       
       
           // For adding address and make it 'default',if it's 
           addAddress: async (userId, addressData) => {
               try {
                   const db = getDb();
                   const userObjectId = new ObjectId(userId);
           
                   const newAddress = {
                       _id: new ObjectId(),
                       userId: userObjectId,
                       fullName: addressData.fullName,  // 'addressData' is the 'parameter' (ie 'req.body' as 'argument')
                       phoneNumber: addressData.phoneNumber,
                       houseNo: addressData.houseNo,
                       street: addressData.street,
                       landmark: addressData.landmark,
                       pincode: addressData.pincode,
                       city: addressData.city,
                       state: addressData.state,
                       instructions: addressData.instructions,
                       default: addressData.defaultAddress || false // This address becomes 'default'(ie 'defaultAddress'), 'true' or 'false'
                   };
       
                   // If address is 'defaultAddress'
                   if (addressData.defaultAddress) {
                       await db.collection(collections.ADDRESS_COLLECTION).updateMany(
                                                                                       { userId: userObjectId },
                                                                                       { $set: { default: false } }  // Set all other address of 'userId', 'default:false' 
                                                                                     );
                   }
       
                   // Counting doucments
                   const addressCount = await db.collection(collections.ADDRESS_COLLECTION).countDocuments({ userId: userObjectId });
                   if (addressCount >= 5) {
                       return { status: false, message: "YOU CAN ONLY SAVE UP TO 5 ADDRESSES" };
                   }
           
                   // Adding current address
                   await db.collection(collections.ADDRESS_COLLECTION).insertOne(newAddress);
                   return { status: true};
           
               } catch (error) {
                   console.error("Error in addAddress:", error);
                   return { status: false, message: "Error saving address" };
               }
           },
       
       
       
          // Get only one address for 'editing'
          getAddressById: async (userId, addressId) => {
           const db = getDb();
           let address = await db.collection(collections.ADDRESS_COLLECTION).findOne({_id: new ObjectId(addressId), userId: new ObjectId(userId)}); // 'findOne()' returns 'one document' that matching '_id' and 'userId'.                                                                                
       
           return address || null;
         },
       
       
           // For 'Edit' the address in 'address' page
           updateAddress: async (userId, addressId, updatedData) => {
             try {
                 const db = getDb();
                 let result = await db.collection(collections.ADDRESS_COLLECTION).updateOne(
                                                                                             { _id: new ObjectId(addressId), userId: new ObjectId(userId) },
                                                                                             { $set: updatedData }  // Set the 'updateData'(ie 'req.body')
                                                                                           );
         
                 return result.modifiedCount > 0 ? { status: true } : { status: false};
                                                
             } catch (error) {
                 console.error("Error in updateAddress function", error);
                 return { status: false, message: "Internal server error in 'updateAddress' function" };
                 }
         },
       
       
           // Delete an address in 'address' page
           deleteAddress: async (userId, addressId) => {
             const db = getDb();
             let result = await db.collection(collections.ADDRESS_COLLECTION).deleteOne({_id: new ObjectId(addressId), userId: new ObjectId(userId)  });                                                                                    
                                                                                         
             return result.deletedCount > 0  ? { status: true } : { status: false };
           },
       
       
           // Make an address default
           makeDefaultAddress: async (userId, addressId) => {
               const db = getDb();
               const userObjectId = new ObjectId(userId);
               const addressObjectId = new ObjectId(addressId);
           
               // Reset all addresses as 'false' for this user
               await db.collection(collections.ADDRESS_COLLECTION).updateMany( { userId: userObjectId, default:true }, // 'two' matches
                                                                               { $set: { default: false } }     // set all matching address into 'default:false'
                                                                             );  
                                                                           
               // Set the selected address as default
               let result = await db.collection(collections.ADDRESS_COLLECTION).updateOne( { _id: addressObjectId, userId: userObjectId }, // matching with 'userId' and 'addressId' of current address
                                                                                           { $set: { default: true } }
                                                                                         );                                                                           
               return result.modifiedCount > 0  ? { status: true}  : { status: false, message: "Address not found" };
           },
       
       
            // For get 'default' address or 'first' address for 'Checkout' page
            getDefaultAddress: async (userId) => {
             try {
                 const db = getDb();
                 const defaultAddress = await db.collection(collections.ADDRESS_COLLECTION).findOne({userId: new ObjectId(userId), default: true }); // two matches
                                                                                                                                                                                                      
         
                 // If no default address, return the first/existing address
                 if (!defaultAddress) {                
                     return await db.collection(collections.ADDRESS_COLLECTION).findOne({ userId: new ObjectId(userId) });
                 }
         
                 return defaultAddress;
             } catch (error) {
                 console.error(error);
                 return null;
             }
           },
       
       
       
           // For retrieve user addresses to display in 'address' page
           getUserAddresses: async (userId) => {
             try {
                 const db = getDb();
                 const addresses = await db.collection(collections.ADDRESS_COLLECTION).find({ userId: new ObjectId(userId) }).toArray();  // 'toArray' is enough for retrieve upto 10-20 documents at same time. 
         
                 if (!addresses.length) {
                     console.log("No addresses found for this user.");
                     return [];
                 }
         
                 return addresses;
             } catch (error) {
                 console.error("Error fetching addresses:", error);
                 return [];
             }
         },
       
     
         // For retrieve 'shipping cost' in payment section of 'razorpay','cash on delivery' etc.
         getShippingCost: async () =>{
           const db = getDb();
           const invoiceData = await db.collection(collections.INVOICE_SETTINGS).find().toArray();
           return invoiceData;
         },
     
       
       
       // For place order after successful payment in 'Razorpay' or 'Cash on delivery'
       placeOrder: async (userId, address, products, paymentMethod, totalAmount) => {
           const db = getDb();
           const productsWithStatus = products.map(item => ({             // Iterating the 'products' array for adding new fields 'status:ordered' and 'delivered:false' and it's good for further operation.
                                                                 ...item, // Copying all items in the 'document' in the 'products' array.
                                                                 status: 'Ordered',
                                                                 delivered: false 
                                                             })
                                                 );
         
           const orderObj = {
             userId: new ObjectId(userId),
             address,                      // 'address' is an 'object'
             products:productsWithStatus,  // 'products' is an 'array'
             paymentMethod,
             totalAmount,
             status: 'Placed',
             date: new Date()             // 'Date' creates 'time stamp'(ie current date with time) 
           };
         
           const result = await db.collection(collections.ORDERS_COLLECTION).insertOne(orderObj);
           
           return result.insertedId;
         },
       
       
       // After successfully place the order
         handleOrderSuccess: async (user) => {
           try {
             const db = getDb();
             const cartCollection = db.collection(collections.CART_COLLECTION);
             const userObjectId = new ObjectId(user._id);
       
             // After successfully placing the order,remove all data of user,from 'cart' collection
             await cartCollection.deleteOne({ user: userObjectId }); 
       
             // Send the email to user
             const transporter = nodemailer.createTransport({  // 'nodemailer.createTransport()' creates an object,contains sender's 'email', 'password' etc.
               service: 'gmail',                               // It defines 'gmail' is the 'sending' email provider
               auth: {
                   user: process.env.EMAIL_USER,
                   pass: process.env.EMAIL_PASS,
                 },
             });
       
             const mailOptions = {  // details of email
               from: process.env.EMAIL_USER,
               to: user.email,
               subject: 'Your Order Was Placed Successfully!',
               html: `
                 <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
                   <h2 style="color: #4CAF50;">Hi ${user.name || 'Customer'},</h2>
                   <p>Thank you for shopping with us! Your order has been <strong>successfully placed</strong>.</p>
                   <p>We’ll notify you once your items are shipped.</p>
                   <hr>
                   <p style="font-size: 14px;">Have any questions? We're always here to help.</p>
                   <p style="font-size: 14px;">Happy Shopping!</p>
                   <h3 style="color: #4CAF50;">— YourShop Team</h3>
                 </div>
               `
             };
         
             await transporter.sendMail(mailOptions); // 'sendMail' used for sending mail with 'transporter' object and 'mailOptions', and returns 'Promise' object(ie 'resolved' or 'reject').
             return { status: true };
             
           } catch (error) {
             console.error("Error in handleOrderSuccess:", error);
             return { status: false, error };
           }
         },
       
       
       
       // For retrieve all orders of user
       getUserOrders: async (userId) => {
           const db = getDb();
           const orders = await db.collection(collections.ORDERS_COLLECTION).find({ userId: new ObjectId(userId) }).toArray(); // Return an array  
           return orders;
         },
       
       
       
       
          // Retrieve order details based on user's order
          getOrderDetailsById: async (orderId) => {
           try {
             const db = getDb();
             const order = await db.collection(collections.ORDERS_COLLECTION).findOne({ _id: new ObjectId(orderId) });
         
             if (!order) return null;
         
             return order; // Return 'order'.
            
           } catch (err) {
             console.error('Error in getCancelledOrderDetails:', err);
             throw err;
           }
         },
       
       
         // For cancel the order and add some new fields like refundInitiatedDate' and 'cancelled' etc
         cancelOrder: async (orderId) => {
           const db = getDb();
           try {
             const order = await db.collection(collections.ORDERS_COLLECTION).findOne({ _id: new ObjectId(orderId) });
         
             if (!order) throw new Error('Order not found');
         
             // Add new fields 'refundInitiatedDate' and 'cancelled' into each product 
             const updatedProducts = order.products.map(item => ({
               ...item,                                // copying each 'item'(ie 'product') in the 'products' array.
               refundInitiatedDate: new Date(),
               cancelled: true
             }));
         
             // Adding new fields like 'status','refundStatus' etc into 'order' document
             const updateQuery = {
                                   $set: {             // We can directly use it in 'updateOne()'
                                     status: 'Cancelled',
                                     deliveryStatus: 'Cancelled',
                                     refundStatus: 'Initiated',
                                     refundInitiatedDate: new Date(),
                                     products: updatedProducts 
                                   }
                                 };
         
             await db.collection(collections.ORDERS_COLLECTION).updateOne(
                                                                           { _id: new ObjectId(orderId) },
                                                                           updateQuery
                                                                         );
         
             return { success: true };
         
           } catch (error) {
             console.error('Error cancelling order:', error);
             throw error;
           }
         },
       
       
           // For update 'Out for delivery' date
           postponeDelivery: async (orderId, newDate) => {
             const db = getDb();
             
             await db.collection(collections.ORDERS_COLLECTION).updateOne(
                                                                           { _id: new ObjectId(orderId) },
                                                                           {
                                                                             $set: {
                                                                               "products.$[].outForDeliveryDate": newDate,   // Adding new fields.
                                                                               "products.$[].deliveryStatus": "Out for Delivery"
                                                                             }
                                                                           }
                                                                         );
       
             return { success: true }; 
           },
       
       
       
           // Retrieve data of review, for check user already reviewed
           returnProductData: async (orderId, productId) => {
             try {
               const db = getDb();
               const objectOrderId = new ObjectId(orderId);
               const objectProductId = new ObjectId(productId);
           
               const order = await db.collection(collections.ORDERS_COLLECTION).findOne({ _id: objectOrderId }); // Retrieve 'orders' collection to check '_id' of 'products' arrayField(in the 'orders' collection)is same as 'productId' of 'Rate the Product'(ie checking the reviewing product contains in the order) 
               if (!order) return null;
          
               const product = order.products.find(item => item._id.toString() === productId);  // Convert to string for check both 'id' and if 'not' matched function returns.
               if (!product) return null;
           
               const review = await db.collection(collections.REVIEWS_COLLECTION).findOne({ productId: objectProductId,userId: order.userId});  // Check the matching of 'productId' and 'userId:order.userId'('order.userId' confirm ordered and reviewed by same user)
           
               return { review };  // Return 'review' inside an object
           
             } catch (error) {
               console.error('Error in returnProductData:', error);
               throw error;
             }
           },
       
       
       
           // For submit the review about product
           submitReview: async ({ userId,usersName, orderId, productId, rating, title, review, image }) => {
             const db = getDb();
           
             // Check if the user has already reviewed this product
             const existingReview = await db.collection(collections.REVIEWS_COLLECTION).findOne({
                                                                                                   userId: new ObjectId(userId),
                                                                                                   productId: new ObjectId(productId)
                                                                                               });
           
             if (existingReview) {
               return { error: true };
             }
           
             const reviewData = {
                                 userId: new ObjectId(userId),
                                 usersName,
                                 orderId: new ObjectId(orderId),
                                 productId: new ObjectId(productId),
                                 rating: parseInt(rating),
                                 title,
                                 review,
                                 image,
                                 date: new Date()
                               };
           
             const result = await db.collection(collections.REVIEWS_COLLECTION).insertOne(reviewData);
           
             return {                        // Return 'reviewData' with 'insertedId'
               insertedId: result.insertedId,
               ...reviewData
             };
           },
       
       
       
           // For retrieve data for display invoice
            getInvoiceData : async (orderId, productId) => {
             const db = getDb();
       
             const order = await db.collection(collections.ORDERS_COLLECTION).findOne({ _id: new ObjectId(orderId) });
             if (!order) throw new Error("Order not found");
       
             const userAddress = order.address || {};      // 'address' is the object/document in 'order' object 
             const productsInOrder = order.products || []; // Retrieve data of 'products' array in 'order' for iterating and adding some new fields like 'taxPerUnit','itemTax','subTotal' etc
         
             let subTotal = 0;
             let totalTax = 0;
         
             const updatedProducts = productsInOrder.map( item => {
                         const taxRate = parseFloat(item.taxRate ?? 0);  // 'parseFloat()' gives decimal data also
                         const price = parseFloat(item.decreasedPrice ?? item.price);
                         const quantity = parseInt(item.quantity);
                 
                         const taxPerUnit = price * taxRate / 100;      // Adding new field into 'products' array,and when iterating 'products' array calculate 'taxPerUnit' of each product
                         const itemTax = taxPerUnit * quantity;
                         const itemTotal = (price + taxPerUnit) * quantity;
                 
                         subTotal += price * quantity;                 // In each iteration 'price' and 'quantity' of each product will accumulated to 'let' variable 'subTotal'
                         totalTax += itemTax;
                 
                         return {
                             ...item,                                  // 'Return' a new object(ie 'return {}') and '...' spread operator used for copying all fields including new fields into new object.
                             taxRate,
                             taxPerUnit: taxPerUnit.toFixed(2),
                             priceExclTax: price.toFixed(2),
                             totalAmount: itemTotal.toFixed(2),
                             totalProductTax: itemTax.toFixed(2),
                             isSelected: item._id?.toString() === productId.toString()
                         };
             });
         
             const invoiceSettings = await db.collection(collections.INVOICE_SETTINGS).findOne({});   // For retrieve 'shippingCost','promotionDiscount' and 'seller address'.
             const shipping = invoiceSettings?.shippingCost || 0;
             const discount = invoiceSettings?.promotionDiscount || 0;
         
             const rawGrandTotal = subTotal + totalTax + shipping - discount;
             const roundedGrandTotal = Math.round(rawGrandTotal);   // 'Math.round()' removes the decimal point
         
             return {                                               // 'return' all fields created above,includes 'seller' address object,in an 'object'
                 orderId,
                 date: order.date,
                 customer: userAddress,
                 products: updatedProducts,
                 subTotal: subTotal.toFixed(2),
                 totalTax: totalTax.toFixed(2),
                 shipping,
                 discount,
                 grandTotal: roundedGrandTotal.toFixed(2),
                 seller: {
                     companyName: invoiceSettings?.companyName,
                     road: invoiceSettings?.road,
                     place: invoiceSettings?.place,
                     city: invoiceSettings?.city,
                     pincode: invoiceSettings?.pincode,
                     state: invoiceSettings?.state,
                     nation: invoiceSettings?.nation,
                     phone: invoiceSettings?.phone,
                     email: invoiceSettings?.email,
                     gstin: invoiceSettings?.gstin
                 }
               };
             },
           

}