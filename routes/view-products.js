const express = require('express');
const router = express.Router();
const viewProductHelper = require('../helpers/view-product-helper');
const verifyLogin = require('../middleware/verifyLogin');
const { log } = require('handlebars/runtime');


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





module.exports = router;