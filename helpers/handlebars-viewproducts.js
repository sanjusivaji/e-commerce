const moment = require('moment');
const hbs = require('hbs')

module.exports = {


// For display 'star rating'
starIcons: function (rating) {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.40 && rating <  5; // 'halfStar' becomes when 'reminder' is greater than '0.40'.
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
  
    let starsHtml = '';
  
    for (let i = 0; i < fullStars; i++) {
      starsHtml += '<i class="fas fa-star text-warning"></i>';
    }
    if (halfStar) {
      starsHtml += '<i class="fas fa-star-half-alt text-warning"></i>';
    }
    for (let i = 0; i < emptyStars; i++) {
      starsHtml += '<i class="far fa-star text-warning"></i>';
    }
  
    return new hbs.SafeString(starsHtml);
  },


  starRating: function (rating) {
    let stars = [];
    for (let i = 0; i < Math.round(rating); i++) stars.push('*');
    return stars;
  },



 // For display 'discounted price'
  discountedPrice: (price, discount) => {
    return Math.round(price - (price * discount / 100));
  },

  and : function (a,b) {
    return a && b;
  },

  // For iterate the array and enter into 'blocks'
  range: function (start, end, options) {
    let result = '';
    for (let i = start; i <= end; i++) {
      result += options.fn(i);                                  
    }                          
    return result;
  },

    // For comapare by using different operators
    ifCond: function (v1, operator, v2, options) {
      switch (operator) {
        case '==': return (v1 == v2) ? options.fn(this) : options.inverse(this);
        case '===': return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '<': return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '>': return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=': return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        case '<=': return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '!=': return (v1 != v2) ? options.fn(this) : options.inverse(this);
        default: return options.inverse(this);
      }
    },

    

times: function(n, options) {
  let accum = '';
  for (let i = 0; i < n; ++i) {
    accum += options.fn(i);
  }
  return accum;
},

}
