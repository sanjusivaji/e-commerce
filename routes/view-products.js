const express = require('express');
const router = express.Router();
const viewProductHelper = require('../helpers/view-product-helper');
const verifyLogin = require('../middleware/verifyLogin');
const { log } = require('handlebars/runtime');
var path = require('path');
var fs = require('fs');
const nodemailer  = require('nodemailer');  // For send 'email'
const pdf = require('html-pdf-node');      // For 'pdf'
const hbs = require('handlebars');
const crypto = require("crypto");
const Razorpay = require('razorpay');
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY,
    key_secret:  process.env.RAZORPAY_SECRET,
});
const paypal = require('paypal-rest-sdk');
const { title } = require("process");
const { toFixed } = require("../helpers/handlebars-helpers");
paypal.configure({
    'mode': 'sandbox', // Use 'live' in production
    'client_id': 'AeQqRVXT-cGM2OOoIfVZ2-IoqvnbpjNa4xTxIiZCrCGlMESNPxujANkQUg-Xk1waH427HIVUNCAJZ9iv',
    'client_secret': 'EPXHpvdIdAFupD_DX-cW1xcp6828tJw7I1dqw3H3Ks-_OOX_VK_BCI4_BaHxgdesHihnU9cxMFqn2NVx'
});


// Homepage route
router.get('/', async (req, res) => {
  try {
    let user = req.session.user;   
    let products = [];

    products = await viewProductHelper.getAllProducts(); // Function return 'products' array contains all data of product
    
    const cartCount = user ? await viewProductHelper.getCartCount(user._id) : 0;  // For display total no.of products in cart. 

    res.render('user/view-products', {
      user,
      products,
      cartCount,
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).send('Error loading products');
  }
});



// Search route for suggestions
router.get('/search', verifyLogin,async (req, res) => {
  let user = req.session.user;
  const query = req.query.q ? req.query.q.trim() : '';  // Retrieve 'q'(ie user input letter)from 'req.query' and 'trimming' the space and charecter it.
  
  if (!query) return res.json([]);

  try {
    const products = await viewProductHelper.searchProducts(query);   // Function return 'array' of matching product
    res.json(products);
  } catch (err) {
    console.error('Error in /search:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// Search results route
router.post('/search-results',verifyLogin, async (req, res) => {
  let { products = [], selectedId } = req.body;

  try {
    if (typeof products === 'string') {
      try {
        products = JSON.parse(products);  // Convert string array into array of object
      } catch (parseErr) {
        console.error('Error parsing products:', parseErr);
        throw new Error('Invalid products data format');
      }
    }

    if (!Array.isArray(products)) {
      throw new Error('Products must be an array');
    }

    // Rearranging user clicked products in the list, as first position
    let finalProducts = [];
    if (products.length > 0 && selectedId) {
      finalProducts = [
                        ...products.filter(item => item._id.toString() === selectedId),  // 'filter()' returns more than 'one' array,based on condition, and '...products'(spread operator)'combines' arrays.  
                        ...products.filter(item => item._id.toString() !== selectedId)
                      ];
    } else {
      finalProducts = await viewProductHelper.getAllProducts();
    }

    let cartCount = 0;
    if (req.session.user?._id) {
      cartCount = await viewProductHelper.getCartCount(req.session.user._id); 
    }

    res.render('user/view-products', {
     user : req.session.user || null,
      products: finalProducts,
      cartCount,
    });
  } catch (err) {
    console.error('Error in /search-results:', err);
    res.status(500).render('user/view-products', {
      products: [],
      user: req.session.user || null,
      cartCount: 0,
      error: 'An error occurred while loading products.'
    });
  }
});



// For 'Add to Cart' button
router.post('/add-to-cart/:id', verifyLogin, async (req, res) => {
  try {
      req.session.loggedIn = true;
      const quantity = Math.round(req.body.quantity) || 1;
      await viewProductHelper.addToCart(req.params.id, req.session.user._id, quantity);
      let cartCount = await viewProductHelper.getCartCount(req.session.user._id);

      res.json({success:true,cartCount});
  } catch (error) {
      console.error("Error adding to cart:", error);
      res.status(500).json({success:false,error:'Error occurs in add-to-cart'});
  }
});


// For 'Buy Now' button
router.post('/buy-now/:id',verifyLogin, async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  const productId = req.params.id;
  const quantity = parseInt(req.body.quantity) || 1;

  try {
    const product = await viewProductHelper.getProductForBuyNow(productId);

    if (!product) {
      return res.status(404).send("Product not found");
    }

    // Ensure price is numeric and round to nearest whole number
    const price = Math.round(Number(product.price));
    const discountedPrice = Math.round(price - (price * (product.discount)) / 100);

    const productForCheckout = {
      _id: product._id,
      name: product.name,
      price: price.toFixed(2),                 
      decreasedPrice: discountedPrice.toFixed(2), 
      quantity: quantity,
      image: product.images?.[0] || "",
      total: (discountedPrice * quantity).toFixed(2) 
    };

    req.session.cart = [productForCheckout];
    req.session.userAddress = null;

    res.redirect('/cart/checkout');
  } catch (err) {
    console.error("Buy Now error:", err);
    res.status(500).send("Server error");
  }
});


// For checkout page
router.get('/cart/checkout', verifyLogin, async (req, res) => {
    let user = req.session.user;
    // Ensure cart session exists
    if (!req.session.cart) {
      let cartData = await viewProductHelper.getCartProducts(user._id);
      req.session.cart = cartData.products.length > 0 ? cartData.products : [];
    }
  
    // Calculate grand total 
    let grandTotal = 0;
    if (req.session.cart.length > 0) {
      grandTotal = req.session.cart .reduce((sum, item) => sum + item.decreasedPrice * item.quantity, 0); 
    }
    
    const cartCount =  await viewProductHelper.getCartCount(user._id) ;
    console.log('This is cartcount in ',cartCount);
    
    res.render('user/checkout', {
        user: req.session.user,
        title: "Checkout",
        userAddress: req.session.userAddress,
        products: req.session.cart,
        grandTotal,
        cartCount
    });
  });




  // Call from 'partial/user-header' for display user's 'cart'
  router.get('/cart', verifyLogin, async (req, res) => {
    try {
          let user = req.session.user;
          req.session.cart;
          let cartData = await userHelper.getCartProducts(user._id);  // Function returns an 'array of object' and 'status'.
  
          // Adding 'decreasedPrice' and 'total' into the 'array'
          const cartItems = cartData.products.map(item => {
              const price = parseInt(item.price);  // For find 'decreasedPrice'
              const discount = parseInt(item.percentage || 0);
              const quantity = parseInt(item.quantity);
              const decreasedPrice = parseInt( discount ? price - (price * discount / 100): price);
              const total = parseInt(decreasedPrice * quantity);
  
              return { ...item, decreasedPrice: decreasedPrice.toFixed(2), total: total.toFixed(2)};  // 'spread' operator used for copying each 'item' document into new document, in 'new' array.
      
          });
  
          const grandTotal = cartItems.reduce((sum, item) => sum + parseInt(item.total), 0);
          const cartCount = user ? await userHelper.getCartCount(user._id) : 0; 
          req.session.cart = cartItems;
          
          res.render('user/cart', {
              user,
              products: cartItems,
              grandTotal: grandTotal.toFixed(2),
              cartCount
          });
    } catch (error) {
        console.error("Error fetching cart:", error);
        res.status(500).send("Error loading cart");
    }
  });
  
  
  // For update product quantity in 'Cart' page
  router.post('/cart/update/:id', verifyLogin, async (req, res) => {
    try {
        const userId = req.session.user._id;
        const productId = req.params.id;
        const newQuantity = parseInt(req.body.quantity);
  
        if (newQuantity < 1) {
            return res.status(400).json({ success: false, message: "Invalid quantity" });
        }
  
        await userHelper.updateCartQuantity(userId, productId, newQuantity); // Function returns 'success' 'true' or 'false'
        res.json({ success: true });
    } catch (error) {
        console.error("Error updating cart:", error);
        res.status(500).json({ success: false, message: "Error updating cart" });
    }
  });
  
  
  // For 'Remove' button in the 'Cart' page
  router.delete('/cart/remove/:id',verifyLogin, async (req, res) => {
    try {
        let userId = req.session.user._id;
        let productId = req.params.id;
        await userHelper.removeFromCart(userId, productId); // Function return 'success: true' or 'false'.
  
        res.json({ success: true, message: "Item removed successfully" });
    } catch (error) {
        console.error("Error when remove product from cart", error);
        res.status(500).json({ success: false, message: "Failed to remove item" });
    }
  });
  
  
  // For retrieve user address to display in 'address' page
  router.get('/cart/address',verifyLogin, async (req, res) => {
    
    try {
        const user = req.session.user;
        let userId = req.session.user._id;
        let addresses = await userHelper.getUserAddresses(userId); // Function returns an 'array' contains user 'addresses'.
        
        res.render('user/address', {user, addresses: addresses.length ? addresses : []});                          
  
    } catch (error) {
        console.error("Error fetching addresses:", error);
        res.status(500).send("Error loading addresses");
    }
  });
  
  
  // For add the user address in 'address' page
  router.post('/add-address',verifyLogin,async (req, res) => {
      try{
      let result = await userHelper.addAddress(req.session.user._id, req.body); // Function returns 'success:true' or 'false' with 'error' message.
      res.json(result);
      }catch (error) {
        console.error("Error adding addresses:", error);
        res.status(500).send("Error adding addresses");
    }
  });
  
  
  // Retrieve address, for editing
  router.get('/get-address/:id',verifyLogin, async (req, res) => {
    let addressId = req.params.id;
    let userId = req.session.user._id;
    let address = await userHelper.getAddressById(userId, addressId); // Function returns a 'document'.
    
    res.json(address);
  });
  
  
  // Uploading the edited the address
  router.put('/update-address/:id',verifyLogin, async (req, res) => {
    try {
        const addressId = req.params.id;
        const userId = req.session.user._id;
        const updatedData = req.body; 
  
        const result = await userHelper.updateAddress(userId, addressId, updatedData);  // Function returns 'status'.
  
        res.json(result);
    } catch (error) {
        console.error("Error in update-address route:", error);
        res.status(500).json({ status: false, message: "Internal server error" });
    }
  });
  
  
  // For delete an address
  router.delete('/delete-address/:id',verifyLogin, async (req, res) => {
    let addressId = req.params.id;
    let userId = req.session.user._id;
    let result = await userHelper.deleteAddress(userId, addressId); 
    res.json(result);
  });
  
  // For make an address 'default'
  router.put('/make-default-address/:id',verifyLogin, async (req, res) => {
      let addressId = req.params.id;
      let userId = req.session.user._id;
      let result = await userHelper.makeDefaultAddress(userId, addressId);
      res.json(result);
  });
  
  
  
  // For get 'default' address for Checkout page
  router.get('/get-address', verifyLogin,async (req, res) => {
      if (!req.session.user) return res.status(401).json({ message: "Unauthorized" });
  
      let address = await userHelper.getDefaultAddress(req.session.user._id);  // Function returns 'one document'.
      
      if (!address) {
          return res.json(null); 
      }
  
      req.session.userAddress = address;
      res.json(address);
  });
  
  
  // Create a checkout session 'middleware' function
  function verifyCheckoutSession(req, res, next) {
    if (!req.session.user || !req.session.cart || !req.session.userAddress) {
      console.log('This error occurs verifyCheckoutSession');
      
      return res.redirect('/cart');
    }
    next();
  }
  
  
  // When click the 'Place order' button from 'checkout' page.
  router.get('/checkout/payment', verifyCheckoutSession, async (req, res) => {
    try {
      const user = req.session.user;
      const userAddress = req.session.userAddress;
      const cartItems = req.session.cart;
  
      if (!userAddress) {
        return res.status(400).send("No address found! Please add an address before proceeding.");
      }
  
      const cartCount = user ? await userHelper.getCartCount(user._id) : 0; 
      res.render('user/payment', {
        user: user,
        userAddress: userAddress,
        products: cartItems,
        cartCount
      });
  
    } catch (err) {
      console.error(err);
      res.status(500).send("Failed to load payment page");
    }
  });
  
  
  
  // For display 'Order Summary' page after select 'Razor pay' option
  router.get('/razorpay/pay', verifyCheckoutSession, async (req, res) => {
    try {
      const cartItems = req.session.cart;
      const user = req.session.user;
      const userAddress = req.session.userAddress;
  
      const subTotal = cartItems.reduce((sum, item) => sum + item.decreasedPrice * item.quantity,0).toFixed(2);
  
      const invoiceSettings = await userHelper.getShippingCost();  // Return an 'array'
      console.log('This is shipping',invoiceSettings);
      
      let shippingCost = invoiceSettings[0].shippingCost || 0;     // 'invoiceSetting' is the 'array' and 'shippingCost' is a value,inside the 'document', in the array.   
      let  promotionDiscount =  invoiceSettings[0].promotionDiscount || 0 ;
  
  
      const grandTotal = subTotal + (shippingCost - promotionDiscount);
  
      // Razorpay amount is in paisa
      const orderData = { amount: grandTotal * 100, // Razorpay uses 'amount' in 'paisa'(if 'dollar' or 'Euro', it become 'cent') 
                          currency: "INR", 
                          receipt: `order_${Date.now()}`,};  // 'Date.now()' creates current time stamp.
      const order = await razorpay.orders.create(orderData); // 'razorpay.orders.create()' register the order and return an 'order.id',used in '.open()'.
  
      const cartCount = user ? await userHelper.getCartCount(user._id) : 0;
  
      const deliveryDate = new Date();                  // Create an 'Date' object with 'current date' and time.
      deliveryDate.setDate(deliveryDate.getDate() + 7); // 'getDate()' used for get the date(ie date in 'deleveryDate' object) and 'setDate' used for 'update'  the date.
      const formattedDate = deliveryDate.toDateString(); // 'toDateString()' convert date into readable 'string' like 'Friday June 2025'
    
      res.render('user/razorpay-payment', {
        subTotal, 
        orderId: order.id,
        amount:(order.amount/100).toFixed(2), // 'amount' is built-in 'razorpay key' represent 'grand total'(ie 'final amount' pay by user).
        user,
        userAddress,
        products: cartItems,
        cartCount,
        shippingCost: shippingCost.toFixed(2),
        promotionDiscount : promotionDiscount.toFixed(2),
        grandTotal,
        deliveryDate: formattedDate || null,
        keyId: process.env.RAZORPAY_KEY,
      });
  
    } catch (err) {
      console.error("Razorpay error:", err);
      res.status(500).send("Razorpay is currently unavailable. Please choose another payment method.");
    }
  });
  
  
  // Post request from 'razorpay-payment.hbs' for check the 'signature' and 'place' the order
  router.post("/razorpay/verify-payment", async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body; // '3' values contains in 'post' request,created by 'razorpay'.
        const secret =  process.env.RAZORPAY_SECRET; 
  
        let hmac = crypto.createHmac("sha256", secret); // Creates a 'HMAC'(Hash-based Message Authentication Code)object with our 'secret' key.
        hmac.update(razorpay_order_id + "|" + razorpay_payment_id);  // Updating 'HMAC' object with 'order id' and 'payment id'.
        let generated_signature = hmac.digest("hex");  // '.digest('hex')' creates a readable 'haxadecimal' 'string'(ie digital signature).
  
        if (generated_signature === razorpay_signature) {  // Compare both 'razor pay' created 'signature' and 'Node.js server' created 'signature' for 'store' the data and further operations.
            const user = req.session.user;
            const address = req.session.userAddress;
            const products = req.session.cart; // 'products' is an 'array'.
            
            const totalAmount = products.reduce((sum, item) => sum + (item.decreasedPrice * item.quantity), 0);
  
            const orderId = await userHelper.placeOrder( user._id,address, products, "Razorpay", totalAmount); // 'address' is the 'document','products' is an 'array' and 'Razorpay' is the 'string' representing the 'payment method'.
  
            req.session.cart = []; // After successful order, clear the cart in 'MongoDb' and also in 'session'.
  
            return res.json({ success: true, orderId });
        } else {
            return res.json({ success: false, message: "Invalid Signature" });
        }
    } catch (error) {
        console.error("Error verifying Razorpay payment:", error);
        res.status(500).json({ success: false, message: "Payment verification failed" });
    }
  });
  
  
  // For display 'Order summary' page in 'cash on delivery'
  router.get('/cash-on-delivery', verifyCheckoutSession, async (req, res) => {
        const user = req.session.user;
        const userAddress = req.session.userAddress;
        const cartItems = req.session.cart;
  
        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + 7);
        const formattedDate = deliveryDate.toDateString();
  
        const subTotal = req.session.cart.reduce((sum, item) => sum + (item.decreasedPrice * item.quantity), 0);
        const cartCount = user ? await userHelper.getCartCount(user._id) : 0;
  
        const invoiceSettings = await userHelper.getShippingCost();  // Return an 'array'
        let shippingCost = invoiceSettings[0].shippingCost || 0;  // 'invoiceSetting' is the 'array' and 'shippingCost' is a value,inside the 'document', in the array.   
        let  promotionDiscount =  invoiceSettings[0].promotionDiscount || 0 ;
  
        const grandTotal = subTotal + (shippingCost - promotionDiscount);
  
        res.render('user/cashOnDelivery', {
          user,
          userAddress,
          products: cartItems,
          deliveryDate: formattedDate,
          subTotal:subTotal.toFixed(2),
          grandTotal:grandTotal.toFixed(2),
          cartCount,
          shippingCost: shippingCost.toFixed(2),
          promotionDiscount: promotionDiscount.toFixed(2),
        })
  });
  
  
  
  
  router.post('/cash-on-delivery/place-order', verifyLogin, async (req, res) => {
    try {
        const user = req.session.user;
        const address = req.session.userAddress;
        const products = req.session.cart;
        const totalAmount = products.reduce((sum, item) => sum + (item.decreasedPrice * item.quantity), 0);
       
       await userHelper.placeOrder(user._id, address,products,"Cash on Delivery",totalAmount);
  
        req.session.cart = []; // Clear the 'cart' session.
  
        res.redirect('/order-success');
    } catch (err) {
        console.error("COD order failed:", err);
        res.status(500).send("Order placement failed");
    }
  });
  
  
  // For 'paypal' payment preperation
  router.get('/paypal/pay', (req, res) => {
      const payment_json = {
                            "intent": "sale",
                            "payer": { "payment_method": "paypal" },
                            "redirect_urls": {
                                "return_url": "http://localhost:3000/paypal/success",
                                "cancel_url": "http://localhost:3000/paypal/cancel"
                            },
                            "transactions": [{
                                "amount": { "currency": "USD",
                                            "total": "99.00", 
                                            "details": {
                                              "subtotal": "99.00",
                                              "shipping": "0.00",
                                              "tax": "0.00",
                                            }
                                          },
                                "description": "Order Payment"
                            }]
                         };
  
      paypal.payment.create(payment_json, function (error, payment) {
          if (error) {
              res.status(500).json({ error: error.message });
          } else {
              res.redirect(payment.links.find(link => link.rel === "approval_url").href);
          }
      });
  });
  
  
  
  router.get('/paypal/success', async (req, res) => {
    const payerId = req.query.PayerID;
    const paymentId = req.query.paymentId;
  
    const execute_payment_json = {
        "payer_id": payerId,
        "transactions": [{ "amount": { "currency": "USD", "total": "99.00" } }]
    };
  
    paypal.payment.execute(paymentId, execute_payment_json, async (error, payment) => {
        if (error) {
            res.send("Payment Failed");
        } else {
            const user = req.session.user;
            const address = req.session.userAddress;
            const products = req.session.cart;
            const totalAmount = products.reduce((sum, item) => sum + (item.decreasedPrice * item.quantity), 0);
  
            await userHelper.placeOrder(user._id, address,products,"PayPal",totalAmount);
  
            req.session.cart = [];
  
            res.redirect("/order-success");
        }
    });
  });
  
  
  
  // Redirect from after successful order in 'Razorpay' or 'Cash on delivery'
  router.get('/order-success', async (req, res) => {
    try {
    
      const user = req.session.user;
      if (!user || !user._id || !user.email) {
        return res.redirect('/login');
      }
  
      result = await userHelper.handleOrderSuccess(user); // Function returns 'status'.
  
      res.render('user/order-success', {
        title: "Order Successful",
        user
      });
  
    } catch (err) {
      console.error("Error in /order-success route:", err);
      res.status(500).send("Something went wrong");
    }
  });
  
  
  
  
  // Display all orders of user
  router.get('/orders', verifyLogin, async (req, res) => {
    try {
      let user = req.session.user;
      const orders = await userHelper.getUserOrders(user._id);  // Function returns an 'array'(ie 'orders') contains '_id','userId','paymentMethod','status','deliveryStatus','refundStatus'(if cancel the order),'adminMessage','address' object(contains data of user address),'products' array(contains document/object of each products in the order)etc.
      // orders.forEach((order) => {
      //   order.products.forEach((item) =>{
      //     console.log('This is product',order._id,item);
          
      //   } )
      // })
      
      
      res.render('user/orders', { user, orders });
    } catch (error) {
      console.error('Error loading user orders:', error);
      res.status(500).send("Internal Server Error");
    }
  });
  
  
  // Call from 'order' page to retrieve details of each order
  router.get('/order-details/:id', verifyLogin, async (req, res) => {
    user = req.session.user
    const order = await userHelper.getOrderDetailsById(req.params.id);  // Function returns just 'one' document(ie 'object')contains 'userId','paymentMethod' 'address' object and 'products' array(data of each products).
  
    res.render('user/order-details', { user, order });
  });
  
  
  // For 'Cancel Order' button in 'order-details' page
  router.post('/cancel-order', async (req, res) => {
    const { orderId } = req.body;
    const result = await userHelper.cancelOrder(orderId);  // Function adding some new fields like 'status: Cancelled','refundStatus:Initiated' etc,after 'cancel succesfully' and return 'success'.
  
    res.json({success: true});
  });
  
  
  // Call from 'order-details' page for update 'Out for delivery' date, by using 'fetch' 
  router.post('/postpone-delivery', async (req, res) => {
    try{
    const { orderId, newDate } = req.body;
    await userHelper.postponeDelivery(orderId, newDate);  // Function adding new fields like 'outForDeliveryDate:','deliveryStatus:Out for Delivery' and return 'resolved Promise' object.
                                                                        
        res.json({ success: true }); 
     }catch(err) {
        console.error('Error in postpone delivery',err);
        res.json({ success: false });
      };
  });
  
  
  // For details of cancelled order
  router.get('/cancel-details/:id', verifyLogin, async (req, res) => {
    try {
      user = req.session.user
      const order = await userHelper.getOrderDetailsById(req.params.id)  // Function retrieve 'order' object and contains '_id','userId','status','deleveryStatus','refundInitiatedDate','refundStatus','adminMessage','address' object,'products' arrayField etc
      if (!order) return res.redirect('/orders');
  
      res.render('user/cancel-details',{order,user})  
    } catch (err) {
      res.status(500).send('Error loading cancel details')
    }
  });
  
  
  
  
  // For 'delivered details' in 'order'. 
  router.get('/delivered-details/:id', verifyLogin, async (req, res) => {
    const orderId = req.params.id;
    user = req.session.user
  
    try {
      const order = await userHelper.getOrderDetailsById(orderId); // Same function that used above for retrieve order details.
      
      if (!order || !order.products || order.products.length === 0) {
        return res.status(404).send('Order or product not found');
      }
  
      res.render('user/delivered-details', { order,user});
    } catch (error) {
      console.error('Error loading delivered details:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  
  
  
  // Call from 'delivered-details' for 'review'
  router.get('/review/:orderId/:productId', verifyLogin, async (req, res) => {
    const { orderId, productId } = req.params;
    user = req.session.user;
  
    try {
      const data = await userHelper.returnProductData(orderId, productId);  // Function returns an 'object' contains another object 'review'(contains '_id','orderId','productId','userId','rating','review','adminReply' etc).
  
      if (!data) return res.status(404).send('Order or Product not found');
  
      res.render('user/review', {
                                  user,
                                  orderId,
                                  productId,      
                                  review:data.review,
                                  stars: [5, 4, 3, 2, 1],                   // 'radio' button(ie each 'star')defaultly start from 'right' side,so if we select '4th' star(from left to right),it actually '2nd' radio button and it's value,so if we put array in reverse mode(ie 'stars:[5, 4, 3, 2, 1]')it will correctly retrieve value,and make 'visually' correct(ie stars display from 'left to right' after 'stars:[5, 4, 3, 2, 1]')we can use 'css' style,'flex-direction:row-reverse'.
                                });
    } catch (error) {
      console.error('Error loading review page:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  
  
  
  //For review submission
  router.post('/review/:orderId/:productId', verifyLogin, async (req, res) => {
    user = req.session.user;
    const { orderId, productId } = req.params;
    const { rating, title, review } = req.body;
    const imageFile = req.files ? req.files.image : null;    // 'req.files' used for retrieve files and it can only used with 'express-fileupload' module
  
    try {
          if (!rating || !review || !title) {
            return res.status(400).send('Rating, title, and review are required');
          }
  
          let filename = null;
          if (imageFile) {
            const uploadPath = path.join(__dirname, '../public/reviews'); // '_dirname' in 'path.join()' creates correct path name for file
  
            if (!fs.existsSync(uploadPath)) {                             // 'fs' in built-in 'node.js' module used for interact with file system in the server and 'existsSync()'(for check the path is exists),'mkdirSync()'(for make directory/folder),'readFileSync()'(for reading file)etc are its methods.
              fs.mkdirSync(uploadPath, { recursive: true });              // 'recursive: true' creates a parent folder/directory,if it don't exist.
            }
  
            filename = `${Date.now()}-${imageFile.name}`;                 // 'Date.now()' creates time stamp in millisecond(eg,'1733....' and we can convert into 'normal date' by using 'timeStamp=Date.now()', 'new Date(timeStamp)')and here image get a unique name.
            const fullPath = path.join(uploadPath, filename);             // Create a 'fullPath', string path.
            await imageFile.mv(fullPath);                                 // 'mv()' is built-in method of 'express-fileupload' for move file and 'fileName.mv(route)' is the syntax.
          }
  
          const result = await userHelper.submitReview({userId:req.session.user._id,
                                                          usersName: req.session.user.name,  // For dispaly 'user name' with 'icon' in 'review' section in 'view products' 
                                                          orderId,
                                                          productId,
                                                          rating: parseInt(rating),
                                                          title,
                                                          review,
                                                          image: filename,
                                                        });                                  // Function update the above fields and return the same fields with 'insert id'.
  
          
          if (result.error) {
                  res.render('user/review', {
                    user,
                    error: true,
                    // stars: [5, 4, 3, 2, 1],
                    message: 'You have already submitted',
                    orderId,
                    productId
                  });
          }else{
                  res.render('user/review', {
                    user,
                    success: true,
                    stars: [5, 4, 3, 2, 1],
                    message: 'Review submitted successfully',
                    orderId,
                    productId,
                });
          };
      
    } catch (error) {
      console.error('Error submitting review:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  
  
  // For 'return policy' in delivered details
  router.get('/return-policy', (req, res) => {
    res.render('user/return-policy', {
      user: req.session.user,
      title: 'Return Policy'
    });
  });
  
  
  
  
  // View Invoice Page
  router.get('/invoice/:orderId/:productId?', async (req, res) => {
    try {
      user = req.session.user;
      const { orderId, productId } = req.params;
      const invoiceData = await userHelper.getInvoiceData(orderId, productId);   // Function returns a object contains 'orderId','customer' object(contains address of user),'products' array(contains of details of each product),'shipping cost','discount','grand total','seller' object(contains address of seller) etc.
      const {  date, customer, products, subTotal, totalTax, shipping, discount, grandTotal, seller } = invoiceData;  // Destructuring data same like 'shipping:invoiceData.shipping'
    
      const totalAfterTax = parseInt(subTotal) + parseInt(totalTax);
  
      const order = {    // Assign all fields in 'order' object
        _id: orderId,
        date,
        address: customer,
        products,
        subTotal:totalAfterTax.toFixed(2),
        totalTax,
        shippingCost: shipping,
        promotionDiscount: discount,
        grandTotal,  // It's the 'total' value, after adding 'delivery charge' and reduce 'discount'.
        seller,
      };
   
      res.render('user/invoice', {
        user,
        order,
        isPdf: false,           // For display 'Dowload pdf' button only in 'invoice', 'not' with pdf format.
      });
  
    } catch (error) {
      console.error('Error generating invoice:', error);
      res.status(500).send('Error generating invoice');
    }
  });
  
  
  
  
  // For convert invoice into 'pdf'
  router.get('/invoice-pdf/:orderId/:productId', async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const productId = req.params.productId;
  
      const invoiceData = await userHelper.getInvoiceData(orderId, productId);
      const { date, customer, products, subTotal, totalTax, shipping, discount, grandTotal, settings, seller } = invoiceData; // Destructuring data same like 'shipping:invoiceData.shipping'
  
      const totalAfterTax = parseInt(subTotal) + parseInt(totalTax);
  
      const order = {
        _id: orderId,
        date,
        address: customer,
        products,
        subTotal:totalAfterTax.toFixed(2),
        totalTax,
        shippingCost: shipping,
        promotionDiscount: discount,
        grandTotal,
        seller,
      };
   
      // Compile/render Handlebars file
      const templateHtml = fs.readFileSync(path.join(__dirname, '../views/user/invoice.hbs'), 'utf8');  // 'readFileSync()' is the method of 'fs' module used for reading file and 'path.join()' and '_dirname' find/give direction to this file and 'utf8' is read as text.   
      const template = hbs.compile(templateHtml);         // 'compile()' is built-in method of 'hbs' module,used for rendering(ie display in 'html')the 'handlebar' file and assign this function into 'template'. 
      const finalHtml = template({ order, isPdf: true }); // Call the 'template' function output(ie 'finalHtml')becomes 'string'.
  
      // Generate PDF
      const file = { content: finalHtml };
      const options = { format: 'A4' };
      const pdfBuffer = await pdf.generatePdf(file, options);  // 'generatePdf()' is built-in method of 'html-pdf-node' module(ie we should install by 'npm install html-pdf-node' and import it) and we can directly input 'content:...' and 'format:'A4', and it used for send 'response'(ie 'res.send'),'download' pdf,'save' to disk and attatch to 'email' sender(ie 'nodemailer')
  
      // Send PDF
      res.setHeader('Content-Type', 'application/pdf');        // 'res.setHeader()' is built-in method of 'express.js' used for 'display' and 'download' content(ie pdf)and 'Content-Type', 'application/pdf' is actually like 'Content-Type : application/pdf'(for display 'pdf' in browser)
      res.setHeader('Content-Disposition', `inline; filename=invoice-${order._id}.pdf`);  // It's actually like ''Content-Disposition : inline'  and 'inline' display a preview before download and if it is 'attatchment', not display preview instead just dowloaded it.
      res.send(pdfBuffer);                                     // Sending 'content'(ie 'pdfBuffer')to browser for download and preview.
  
    } catch (err) {
      console.error('Error generating PDF:', err);
      res.status(500).send('Error generating PDF');
    }
  });




module.exports = router;