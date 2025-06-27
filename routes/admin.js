var express = require("express");
var router = express.Router();
var productHelper = require("../helpers/product-helpers"); // In 'product-helpers' function, we write 'function' for 'adding','updating' products, seperately. If we write these function, for 'process' of 'admin panel', in 'admin.js', it's 'ok', but write it in 'seperately' is coding standard. Here calling "product-helper" file by using "../" because "admin.js" is inside 'routes' folder(ie we call by "./") and "product-helper" file is inside 'helper' folder, ie 'same' level of 'route' folder, so we should use "../" for calling "product-helper" file
var path = require('path');
var fs = require('fs');
const userHelpers = require("../helpers/user-helpers"); 
const { order } = require("paypal-rest-sdk");



// For display Signup page
router.get('/signup', (req, res) => {
  res.render('admin/signup', { loginError: req.session.error });
  req.session.error = null;
});




// Data from Signup page
router.post('/signup', async (req, res) => {
  const { name, email, Password } = req.body;

  if (!name || !email || !Password) { // Even we use 'require' attribute in 'html', here double checking is 'good'.
    return res.render('admin/signup', { error: 'All fields are required' });
  }

  try {
    // Check if email already exists
    const exists = await productHelper.checkEmailExists(email); // Function returns 'true' or 'false'.
    if (exists) {
      return res.render('admin/signup', { error: 'Email already registered' });
    }

    const totalAdmins = await productHelper.countAdmins(); // Function returns no.of 'total' admins, both 'sub' or 'super' admins.
    let role = 'sub';

    if (totalAdmins === 0) { // First admin becomes super admin
      role = 'super'; 
    } else {
      const subAdminsCount = await productHelper.countSubAdmins();  // Function returns no.of 'sub admins'
      if (subAdminsCount >= 1) {  // 'No' more than '1' 'sub admin'.
        return res.render('admin/signup', { error: 'Maximum sub admins reached' });
      }
    }

    // Generate OTP and store temp admin data
    const otp = Math.floor(100000 + Math.random() * 900000);  // 'Math.random()' generate number between '0' to '1'(ie '.1' to '.9999' etc) and 'Math.floor()' remove decimal point and rounding it 'down' and '100000*900000' returns '6' digit number.
    req.session.otp = otp;
    req.session.tempAdmin = { name, email, Password, role }; // Retrieved from 'req.body'
    

    // Send OTP to email and redirect to 'verify-email' page
    await productHelper.sendOtpToEmail(email, otp); // Function returns nothing,it just send email.
    res.redirect('/admin/verify-email');
  } catch (err) {
    console.error('Signup error:', err);
    res.render('admin/signup', { error: 'Something went wrong. Please try again.' });
  }
});


// GET: Verify OTP
router.get('/verify-email', (req, res) => {
  res.render('admin/verify-email');
});


// POST: Verify OTP
router.post('/verify-otp', async (req, res) => {
  const { otp } = req.body;

  if (parseInt(otp) === req.session.otp) { // Compare 'email otp' and 'session otp'.
    try {
      const admin = await productHelper.doSignup(req.session.tempAdmin);  // Function returns a 'document' contains extra data like 'passwordHistory','lockUntil' etc.
      req.session.admin = admin;
      req.session.loggedIn = true;
      req.session.otp = null;
      req.session.tempAdmin = null;
      res.redirect('/admin');
    } catch (err) {
      res.render('admin/signup', { error: err.message });
    }
  } else {
    res.render('admin/verify-email', { error: 'Invalid OTP' });
  }
});




//  Admin Logout
router.get('/logout', (req, res) => {
  req.session.destroy(err => {  // 'destroy()' the session
    if (err) {
      console.error('Logout Error:', err);
      return res.redirect('/admin');
    }
    res.redirect('/admin/login');
  });
});



// GET: Admin Login Page
router.get('/login', (req, res) => {
  if (req.session.loggedIn && req.session.admin) {
    return res.redirect('/admin');
  }

  const remainingAttempts = req.session.remainingAttempts;
  const error = req.session.error;
  req.session.error =  null;
  req.session.remainingAttempts = null;

    res.render('admin/login', {
      remainingAttempts,
      error,
    });
  });



//  Admin Login
router.post('/login', async (req, res) => {
  const { email, Password } = req.body;
  const ip = req.ip;  // Retrieve 'ip' address of user,for prevent unwanted admin login

  try {
    const result = await productHelper.validateLogin(email, Password,ip); // Function returns 'admin' document(if loged in successfully)or 'remainingAttempts' or 'locked' or 'error'.
    //console.log('This is result',result);
    req.session.remainingAttempts = result.remainingAttempts; // Assign 'remainingAttempts' into 'session'.
    
    // If 'locked:true'
    if (result.locked) {
      req.session.error = 'Too many failed attempts. Please Try Later.';
      return res.redirect('/admin/login');
    }

    // If 'error' 
    if (result.error) {
      req.session.error = result.error;
      return res.redirect('/admin/login');
    }

    // If 'passwordExpired'
    if (result.passwordExpired) {
      req.session.passwordExpired = true;
      req.session.tempAdminId = result.admin._id;
      return res.redirect('/admin/change-password');
    }

    // If 'logged In'
    req.session.admin = result.admin;
    req.session.loggedIn = true;
    res.redirect('/admin');
  } catch (err) {
    console.error('Login error:', err);
    req.session.error = 'Internal error. Try again later.';
    res.redirect('/admin/login');
  }
});




// GET: Change Password
router.get('/change-password', (req, res) => {
  res.render('admin/change-password');
});


// POST: Change Password
router.post('/change-password', async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const adminId = req.session.tempAdminId || req.session.admin?._id;

  const result = await productHelper.changePassword(adminId, oldPassword, newPassword); // Function returns 'success:true' or 'false'.
  if (result.error) {
    return res.render('admin/change-password', { error: result.error });
  }

  req.session.tempAdminId = null;
  res.redirect('/admin');
});


// For control the access for 'super' and 'sub' admin
function verifyAdmin(requiredRole = 'sub') {   // Here function passes, 'requiredRole' as 'parameter' with default value 'sub' and if we call 'verifyAdmin()' its defaultly 'verifyAdmin(sub)'  
  return (req, res, next) => {                // Returns another 'function'.
      const admin = req.session.admin;       // 'admin' hold the value of 'name' and 'role'.
    
      if (!admin) {
        return res.redirect('/admin/login');
      }
  
      if (requiredRole === 'super' && admin.role !== 'super') { // If 'requiredRole'(ie 'parameter')is 'super' and 'admin.role' also 'super' then go to 'next()',ie "verifyAdmin('super')" gives 'next' movement to 'super' admin, otherwise,ie 'admin.role' is 'not' super,it'll 'res.end()'. And when we use "verifyAdmin()", 'requeiredRole' is defaultly 'sub', then the condition 'requiredRole === 'super' ie 'sub === super' is 'false' even second condition 'admin.role !== 'super' becomes 'true', so "verifyAdmin()" accessable for both 'sub' and 'super'.
        return res.end();                  // For no response
      }
      next(); 
  };
};


// Retrieve all products in admin home page
router.get("/",verifyAdmin(), async function (req, res) {
  try {
   const admin = req.session.admin;
    let products = await productHelper.getAllProducts();  // Function returns 'array of object' 
  
    res.render("admin/view-products", { admin, products });
   
  } catch (error) {
    console.log("Error fetching products:", error);
    res.status(500).send("Error loading products");
  }
});


// Invoke from 'admin/view-products' page
router.get("/add-products", verifyAdmin('super'),function (req, res) {
  res.render("admin/add-products",{ admin: true});
});


// Adding products
router.post("/add-products", verifyAdmin('super'),async function (req, res) {
  try {
    const productData = req.body;

    const insertId = await productHelper.addProduct(productData); // Function return 'insertId' as 'string'

    // Handle multiple image uploads
    if (req.files?.images) {                         // Uploading images through '<form>' submission with 'enctype="multipart/form-data"(from 'add-products' page), and we can retrieve this data by using 'req.files', and it only works with 'express-fileuploads' module.  
      let images = req.files.images;
      if (!Array.isArray(images)) images = [images]; // 'Array.isArray(value)' checks is it 'array' or 'not' and return 'true' or 'false', and 'images' is 'js' object, so it convert into 'array'.

      if (images.length > 5) {
        return res.status(400).send("Maximum 5 images allowed");
      }
      const imagePaths = [];
      for (let i = 0; i < images.length; i++) {
        const filename = `${insertId}_${i}.jpg`; // 'insertId' means 'product id'(got from 'Mongodb',when call the function),and file name something like '60eef..._0.jpg','60eef..._1.jpg' etc
        const filePath = path.join(__dirname, "../public/images", filename); // 'path.join()' built-in 'node.js' module used for correct path/directory for different operating system and '_dirname' is built-in global variable gives absolute path and finally store images in '/public/images' folder with 'filename'.
        const img = images[i];                   // Current image
        await img.mv(filePath);                  // 'mv()' is the method of 'express-fileupload' module and it moves current image into 'filePath'
        imagePaths.push(`images/${filename}`);  // Storing just filename(not actual images) of each images into 'imagePaths' array.
      }

      await productHelper.updateImages(insertId, imagePaths); // Function just uploading 'filename' of each images.
    }

    // Handle video upload
    if (req.files?.video) {
      const video = req.files.video;
      const filename = `${insertId}.mp4`;
      const videoPath = path.join(__dirname, "../public/videos", filename);
      await video.mv(videoPath);  // Move video into 'videoPath'(ie '..public/videos')
      await productHelper.updateVideo(insertId, `videos/${filename}`); // Uploading 'filename' of video.
    }

    res.redirect("/admin"); // After uploading redirect to home page.

  } catch (error) {
    console.log("Error in adding product with media:", error);
    res.status(500).send("Error adding product");
  }
});


// Delete product from admin home page
router.get('/delete-product/:id', verifyAdmin('super'), async (req, res) => {
  try {
      let proId = req.params.id;
      const success = await productHelper.deleteProduct(proId); // Function delete the product from 'product' collection, 'cart' collection of all users and also delete from 'images' and 'videos' file in 'public/images' and 'public/videos' folders.
      if (success) {
          res.redirect('/admin');
      } else {
          res.status(500).send("Error deleting product");
      }
  } catch (error) {
      console.log("Error in deleting product:", error);
      res.status(500).send("Error deleting product");
  }
});


// For edit the product
router.get('/edit-product/:id',verifyAdmin('super'), async (req, res) => {
  try {
      const admin = req.session.admin;
      let proId = req.params.id;
      let product = await productHelper.getProductById(proId);  // Function returns a document
      res.render("admin/edit-product", { admin, product });
  } catch (error) {
      console.log("Error fetching product for edit:", error);
      res.status(500).send("Error loading product for edit");
  }
});


// For uploading editing data of product
router.post('/edit-product/:id',verifyAdmin('super'), async (req, res) => {
  try {
    const proId = req.params.id;
    await productHelper.updateProduct(proId, req.body); // 

if (req.files?.images) {
  const images = Array.isArray(req.files.images) ? req.files.images : [req.files.images]; // Check 'req.files.images' is an 'array',if 'not' make it an 'array'.
  const imageFilenames = [];

  for (let i = 0; i < images.length && i < 5; i++) {
    const imageName = `${proId}_${i}.jpg`;
    const imagePath = path.join(__dirname, '../public/images', imageName);
    await images[i].mv(imagePath);                               // 'mv()' is the method of 'express-fileupload' module and it moves current image into 'imagePath',(ie folder).
    imageFilenames.push(imageName);                              // Storing just filename(not actual images) of each images into 'imagePaths' array.
  }
  await productHelper.updateProductImages(proId, imageFilenames);  // Function just update the image name.
}

  if (req.files?.video) {
    const video = req.files.video;
    const videoName = `product_${proId}.mp4`;
    const videoPath = path.join(__dirname, '../public/videos', videoName);
    await video.mv(videoPath);                               
    await productHelper.updateProductVideo(proId, videoName);  // Function just upload the video file name.
  }

    res.redirect('/admin');
  } catch (error) {
    console.log("Error updating product:", error);
    res.status(500).send("Error updating product");
  }
});



// This route from admin-header 'All users' link
router.get('/users',verifyAdmin('super'), async (req, res) => {
  const admin = req.session.admin;
  try {
    const usersWithOrders = await productHelper.getAllUsersWithOrders(); // Function returns an 'array' contains 'users' as 'document' and 'orders' as 'arrayField' in it.
    
    res.render('admin/users', { usersWithOrders, admin });
  } catch (err) {
    console.error('Error loading all users:', err);
    res.status(500).send("Internal Server Error");
  }
});



// Call from admin header 'Orders'
router.get('/orders',verifyAdmin(),async (req, res) => {
  try {
    const admin = req.session.admin;
    const users = await productHelper.userWithOrderPlaced();  // Function returns the big array 'users',it holds seperate 'document'(ie object)for each users and inside 'users' array contains 'name','email','refundStatus' and 'orders' array and this 'orders' array is lot of data like 'address' object(ie 'address' of user) and 'products' array(contains seperate 'document' for each product). 

    res.render('admin/orders', { users, admin });
  } catch (err) {
    console.error('Error loading all users:', err);
    res.status(500).send("Internal Server Error");
  }
});



// For details of orders
router.get('/order-details/:orderId', verifyAdmin(), async (req, res) => {
  const orderId = req.params.orderId;
  const admin = req.session.admin;

  try {
    const order = await productHelper.getOrderWithDeliveryAndReview(orderId);  // Function returns a 'document'(ie object)contains'_id','userId',totalAmount:','paymentMethod:','status:','address' document and 'products' array,inside 'products' array, contains details of each products,'deliveryStatus','shippedDate' and 'reviews' object,if any 'review' done by user, and inside 'reviews' object contains 'ratings','adminReply' etc.
   
    if (!order) {
      return res.status(404).send('Order not found');
    }

    res.render('admin/order-details', {
      admin,
      order
    });

  } catch (err) {
    console.error('Error loading order details:', err);
    res.status(500).send('Server error');
  }
});



// Call from 'Orders' page when 'Cancelled'
router.get('/cancel-pickup/:orderId', verifyAdmin(),async (req, res) => {
  const orderId = req.params.orderId;
  const admin = req.session.admin;

  try {
    const refundDate = await productHelper.getRefundDateByOrderId(orderId);  // Function returns 'refundDate'
    res.render('admin/cancel-pickup-form', { orderId, refundDate ,admin });

  } catch (err) {
    console.error(err.message);
    req.flash('error', err.message);
    res.redirect('/admin/orders');
  }
});



// Call from 'order-details' page for update admin's reply on user's review
router.post('/reply-review', verifyAdmin('super'), async (req, res) => {
  const { orderId, productId, adminReply } = req.body;
  const admin = req.session.admin;

  try {
    const adminReplies = await productHelper.addAdminReply({ orderId, productId, adminReply }); // Function returns 'true' or 'false' value

    const order = await productHelper.getOrderWithDeliveryAndReview(orderId); // Function returns an 'array' contains 'address' document,'products' arrayField contains details of 'product' and 'reviews' object etc('adminReply','rating' etc contains in 'reviews' object).

    if (!order) {
      return res.status(404).send('Order not found');
    }

    if (!adminReplies) {
      res.render('admin/order-details', {
        error: true,
        message: 'Response not submitted',
        order,
        admin
      });
    } else {
      res.render('admin/order-details', {
        success: true,
        message: 'Response submitted successfully',
        order,
        admin
      });
    }

  } catch (err) {
    console.error('Error replying to review:', err);
    res.status(500).send("Internal Server Error");
  }
});



// Call from 'order-details' page for update delivery status and date
router.post('/update-order-status', verifyAdmin(),async (req, res) => {
  const { orderId, status, statusDate } = req.body;

  try {
    await productHelper.updateOrderStatus(orderId, status, statusDate); // Function update the 'delivery status' and returns 'success' 

    res.redirect(`/admin/order-details/${orderId}`); 
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).send('Failed to update order status');
  }
});



// Call from 'cancel-pickup' page, for set 'admin message'(for pickup) and 'pickup date'
router.post('/set-pickup-message', verifyAdmin(), async (req, res) => {
  const { orderId, pickupDate, message } = req.body;
  const admin = req.session.admin;

  try {
    const order = await productHelper.setPickupDateAndMessage(orderId, pickupDate, message); // Function update 'pickupdate','message' and also return both value for display it.
      res.render('admin/cancel-pickup-form', {
        admin,
        orderId,
        pickupDate: order.pickupDate,          // Send adminMessage and pickupDate again to 'cancel-pickup-form' page
        adminMessage: order.adminMessage,
      });
  } catch (err) {
    console.error('Error setting pickup date:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});



// Call from 'cancel-pickup' page,for set 'refund complete' and its 'date'
router.post('/complete-refund', verifyAdmin('super'), async (req, res) => {
  try {
    const { orderId } = req.body;
    await productHelper.markRefundAsCompleted(orderId);  // Function adds two fields ie 'refundStatus:"Completed" and 'refundCompletedDate:..' and return 'success'.
    
    res.json({success:true});
  } catch (err) {
    console.error("Error marking refund completed:", err);
    res.status(500).send("Internal Server Error");
  }
});




// For create 'delevery charge' and 'user address'
router.get('/delivery-charges',verifyAdmin('super'), async (req, res) => {
  try {

   const admin = req.session.admin
    const invoiceSettings = await productHelper.getShippingCost();  // Function returns an 'array' it contains 'admin address' and 'shipping cost'.
 
    res.render('admin/delivery-charge', {
      invoiceSettings,
      admin,
    });
  } catch (error) {
    console.error('Error loading delivery-charge page:', error);
    res.status(500).send('Failed to load delivery charge page');
  }
});


// For update 'admin address' and 'delivery charge'
router.post('/delivery-charge', verifyAdmin('super'),async (req, res) => {
  try {
   req.session.admin;
    await productHelper.setDeliveryAndAdddress(req.body);  // Function update or add 'admin address' and 'shipping cost' and returns 'success'.
    res.redirect('/admin/delivery-charges');
  } catch (err) {
    res.status(500).send('Failed to save invoice settings');
  }
});


// Call from 'admin-header' for display 'Tax Report'
router.get('/tax-report', verifyAdmin('super'), async (req, res) => {
  try {
    const admin = req.session.admin
    const {orders,grandTotalTax} = await productHelper.getDeliveredOrdersWithTax();  // Function returns an array contains 'document'/object of orders ie '_id','date','paymentMethod','address' object,'products' array, 'totalTax', etc.

    res.render('admin/tax-report', { orders,grandTotalTax,admin });
  } catch (error) {
    console.error('Error loading tax report:', error);
    res.status(500).send('Internal Server Error');
  }
});


// For testing purpose
// router.get('/test', (req, res) => {  // For testing purpose for check 'admin' is working or not, "http://localhost:3000/admin/test".
//   res.send("Admin test route works!");
// });

module.exports = router;
