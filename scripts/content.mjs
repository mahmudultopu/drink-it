// Editorial content for Drink it: blog posts, FAQ and policy pages. build.mjs writes these to data/*.json.

export const POSTS = [
  {
    handle: 'five-cold-can-hacks-to-beat-the-dhaka-heat',
    title: '5 Cold Can Hacks to Beat the Dhaka Heat',
    tag: 'Summer',
    date: '2026-09-17',
    read: 4,
    image: '/assets/img/scenes/blog-4.svg',
    excerpt: 'No fridge space? No problem. Five quick tricks to get your cans ice-cold in minutes.',
    author: { name: 'Nusrat Jahan', role: 'Head of Content' },
    body: `
<p>When the Dhaka sun is at its fiercest, a lukewarm can is a small tragedy. The good news: you do not need a bigger fridge to fix it. Here are five tricks we swear by at Drink it HQ.</p>
<h2>Here is how to get your cans ice-cold, fast:</h2>
<ol>
<li><strong>The salt-ice bath:</strong> Fill a bucket with ice and water, add a generous handful of salt and spin the cans for three minutes. Salt lowers the freezing point of the water, so the bath gets colder than plain ice.</li>
<li><strong>The wet paper towel:</strong> Wrap a can in a damp paper towel and place it in the freezer for 15 minutes. Set a timer — a frozen can is a messy can.</li>
<li><strong>Stack smart:</strong> Cans chill faster lying on their sides with air flowing around them, so do not pack them tight against the freezer wall.</li>
<li><strong>Chill by the carton:</strong> Our 24-can cartons fit a standard fridge shelf when you slide the cans out sideways. Rotate the warm ones to the back.</li>
<li><strong>Cooler on the go:</strong> For picnics, freeze a few spare cans the night before. They double as ice packs and are ready to drink once they thaw.</li>
</ol>
<h2>Quick facts:</h2>
<ul>
<li>Never leave a regular can in the freezer overnight — the contents expand as they freeze.</li>
<li>Most fizzy drinks taste best between 3 °C and 6 °C.</li>
<li>Keep unopened cartons somewhere cool and shaded before chilling.</li>
</ul>
<p>Stock up on a carton of your favourite and you will never wait for a cold drink again.</p>`,
  },
  {
    handle: 'coke-pepsi-or-mojo-the-great-bangladeshi-cola-debate',
    title: 'Coke, Pepsi or Mojo? The Great Bangladeshi Cola Debate',
    tag: 'Favorites',
    date: '2026-09-09',
    read: 5,
    image: '/assets/img/scenes/blog-3.svg',
    excerpt: 'Everyone has a side. We break down what makes each cola different — and how to settle it at your next adda.',
    author: { name: 'Tanvir Ahmed', role: 'Founder' },
    body: `
<p>Ask ten friends which cola is best and you will get eleven answers. In Bangladesh the debate is serious: the global giants share the shelf with a home-grown favourite that people are fiercely loyal to.</p>
<h2>The contenders:</h2>
<ol>
<li><strong>Coca-Cola:</strong> Spiced, vanilla-forward and a little sharper on the fizz. Often described as the "classic" cola taste.</li>
<li><strong>Pepsi:</strong> A touch sweeter with a citrus-leaning bite. Many people find it easier to drink quickly.</li>
<li><strong>Mojo:</strong> The local favourite. Affordable, boldly flavoured and available in 250 ml, 330 ml and zero-sugar versions.</li>
<li><strong>The imported 330 ml cans:</strong> Same brands, a different bottling — worth trying side by side.</li>
</ol>
<h2>Settle it with a blind test:</h2>
<ul>
<li>Chill three cans to the same temperature.</li>
<li>Pour into identical glasses and have a friend label them secretly.</li>
<li>Score for sweetness, fizz and aftertaste — then reveal.</li>
</ul>
<p>Our 6-packs make the perfect blind-test kit. Pick one of each and let the taste buds decide.</p>`,
  },
  {
    handle: 'behind-the-fizz-how-drink-it-gets-cans-to-your-door',
    title: 'Behind the Fizz: How Drink it Gets Cans to Your Door',
    tag: 'Process',
    date: '2026-08-28',
    read: 4,
    image: '/assets/img/scenes/blog-1.svg',
    excerpt: 'From the moment you hit “Place order” to the knock at your door — here is what happens in between.',
    author: { name: 'Nusrat Jahan', role: 'Head of Content' },
    body: `
<p>Ordering a carton of cans should be simple — and the journey behind it should be careful. Here is how an order moves through Drink it.</p>
<h2>Here is how we bring the cans to you:</h2>
<ol>
<li><strong>You order:</strong> Pick your cans, choose singles, packs or cartons and check out with bKash, Nagad, Rocket or cash on delivery.</li>
<li><strong>We confirm:</strong> Our team checks stock and payment details, then confirms your order by phone or message when needed.</li>
<li><strong>We pack:</strong> Cans are inspected for dents and best-before dates, then packed in sturdy cartons so they arrive in perfect shape.</li>
<li><strong>We ship:</strong> A delivery partner brings your order to your address. You can follow every step on the Track Order page.</li>
<li><strong>You enjoy:</strong> Chill, pop and sip. If anything is wrong, we make it right.</li>
</ol>
<h2>Fun facts:</h2>
<ul>
<li>Every can is checked for dents before it leaves our packing table.</li>
<li>Orders in Dhaka usually arrive within one to two days.</li>
<li>Delivery is free on orders above ৳1,500.</li>
</ul>
<p>One store, every brand, delivered to your door — that is the Drink it promise.</p>`,
  },
  {
    handle: 'top-5-cans-for-a-perfect-iftar-table',
    title: 'Top 5 Cans for a Perfect Iftar Table',
    tag: 'Iftar',
    date: '2026-08-14',
    read: 3,
    image: '/assets/img/scenes/blog-2.svg',
    excerpt: 'Break your fast in style. Our five favourite cold cans to pair with piyaju, beguni and haleem.',
    author: { name: 'Tanvir Ahmed', role: 'Founder' },
    body: `
<p>After a long day of fasting, nothing hits like a cold drink next to the iftar spread. Here are the cans our community reaches for most.</p>
<h2>Our iftar line-up:</h2>
<ol>
<li><strong>Clemon Lemon Soda:</strong> Tangy and light — brilliant with fried snacks.</li>
<li><strong>Sprite:</strong> Crisp lemon-lime that cuts through rich, spicy dishes.</li>
<li><strong>Mojo Cola:</strong> A bold, affordable cola for big family tables.</li>
<li><strong>Fanta Orange:</strong> A sweet, fruity favourite for the kids.</li>
<li><strong>Rani Float Mango:</strong> Dessert in a can, with real fruit pieces.</li>
</ol>
<h2>Iftar tips:</h2>
<ul>
<li>Order a carton ahead of time so your cans are chilled before sunset.</li>
<li>Serve over ice with a lemon wedge for an easy upgrade.</li>
<li>Mix and match flavours with a 6-pack of each.</li>
</ul>
<p>Plan your table early — cartons sell out fast in the weeks before Ramadan.</p>`,
  },
  {
    handle: 'zero-sugar-cans-are-they-worth-trying',
    title: 'Zero Sugar Cans: Are They Worth Trying?',
    tag: 'Flavors',
    date: '2026-07-30',
    read: 4,
    image: '/assets/img/scenes/blog-5.svg',
    excerpt: 'Coke Zero, Pepsi Black, Mojo Zero and more — what zero-sugar actually means and how they taste.',
    author: { name: 'Nusrat Jahan', role: 'Head of Content' },
    body: `
<p>Zero-sugar cans have become some of our most-ordered products. If you have never tried one, here is what to expect.</p>
<h2>What does zero sugar mean?</h2>
<p>These drinks use low- or no-calorie sweeteners instead of sugar, so the can contains no added sugar. The taste is designed to be as close as possible to the regular version.</p>
<h2>Zero-sugar cans we stock:</h2>
<ol>
<li><strong>Coke Zero Sugar:</strong> The closest match to classic Coca-Cola.</li>
<li><strong>Pepsi Black:</strong> Bold, with a slightly sharper finish.</li>
<li><strong>Mojo Zero:</strong> The local favourite, sugar-free.</li>
<li><strong>Monster Ultra and Red Bull Sugarfree:</strong> Energy drinks for those who skip sugar.</li>
</ol>
<h2>Good to know:</h2>
<ul>
<li>Taste is personal — try a single can before buying a carton.</li>
<li>Check the can label for ingredients and caffeine content.</li>
<li>If you have a health condition, ask your doctor what suits you.</li>
</ul>
<p>Curious? A 6-pack is the easiest way to find your favourite.</p>`,
  },
  {
    handle: 'how-to-host-the-perfect-adda-with-a-carton-of-cans',
    title: 'How to Host the Perfect Adda with a Carton of Cans',
    tag: 'Party',
    date: '2026-07-12',
    read: 4,
    image: '/assets/img/scenes/blog-6.svg',
    excerpt: 'Birthday, office hangout or rooftop adda — a simple plan for serving everyone without the stress.',
    author: { name: 'Tanvir Ahmed', role: 'Founder' },
    body: `
<p>A good adda needs three things: great company, good snacks and cold drinks that never run out. The last one is the easiest to get right.</p>
<h2>Your party plan:</h2>
<ol>
<li><strong>Count the cans:</strong> Plan on two to three cans per guest for an evening. A 24-can carton covers eight to ten people.</li>
<li><strong>Mix the flavours:</strong> Include a cola, a lemon-lime, an orange and one zero-sugar option so everyone is happy.</li>
<li><strong>Chill ahead:</strong> Put cartons in the fridge the day before, or use a bucket of ice and salt for last-minute cooling.</li>
<li><strong>Set up a drinks corner:</strong> A tub of ice, a bottle opener for glass bottles and a bin for empty cans keeps things tidy.</li>
<li><strong>Order early:</strong> Choose cartons at checkout and add a note with your event date.</li>
</ol>
<h2>Bonus ideas:</h2>
<ul>
<li>Float a few lime slices in the ice tub.</li>
<li>Offer fuchka, chotpoti or kebab rolls to match the fizz.</li>
<li>Recycle cans — aluminium is endlessly recyclable.</li>
</ul>
<p>Order a carton or two and spend the party with your friends, not at the shop.</p>`,
  },
];

export const FAQ = [
  { q: 'Are your cans original and sealed?', a: 'Yes. Every can is sourced from authorised distributors and importers, arrives factory-sealed and carries a best-before date on the base. We check each can for dents before packing.' },
  { q: 'How fast is delivery?', a: 'Orders inside Dhaka usually arrive within 1–2 working days. Other divisions take 3–5 working days. Orders placed before 3:00 PM are processed the same day.' },
  { q: 'Which payment methods do you accept?', a: 'Cash on delivery, bKash, Nagad and Rocket. For mobile payments, send the amount to our merchant number and enter the transaction ID at checkout — we verify and confirm your order.' },
  { q: 'Is delivery free?', a: 'Delivery is free on orders above ৳1,500. Below that it is ৳60 inside Dhaka and ৳120 for the rest of Bangladesh. Some coupons also unlock free delivery.' },
  { q: 'What if a can arrives dented or leaking?', a: 'Message us within 24 hours with a photo and your order number. We will replace the can or refund the amount — no arguments.' },
  { q: 'Can I buy cartons in bulk for an event?', a: 'Absolutely. Choose the 24-can carton on any product page, or contact us for large corporate and event orders and special pricing.' },
  { q: 'Do your cans come cold?', a: 'Cans are shipped at room temperature in sturdy cartons. For the best taste, chill them in the fridge for a few hours or over ice before drinking.' },
  { q: 'Can I track my order?', a: 'Yes. Use the Track Order page with your order number and phone number to see every step from confirmation to delivery.' },
];

export const PAGES = {
  'about-us': {
    title: 'About Us',
    intro: 'Drink it is Bangladesh’s online store for every cold can — one place to shop all your favourite brands, delivered to your door.',
  },
  'shipping-policy': {
    title: 'Shipping Policy',
    body: `
<h2>Delivery areas</h2>
<p>We deliver to all 64 districts of Bangladesh. Delivery inside Dhaka division is quickest; other divisions may take a little longer depending on the courier route.</p>
<h2>Delivery charges</h2>
<ul>
<li>Inside Dhaka: ৳60</li>
<li>Outside Dhaka: ৳120</li>
<li>Free delivery on orders above ৳1,500 (before coupons).</li>
</ul>
<h2>Delivery times</h2>
<ul>
<li>Dhaka: 1–2 working days</li>
<li>Other divisions: 3–5 working days</li>
</ul>
<p>Orders placed before 3:00 PM (Bangladesh time) are processed the same day. Delivery times are estimates and may vary during public holidays, severe weather or high demand.</p>
<h2>Receiving your order</h2>
<p>Please check your order while the delivery person is present. If a carton is damaged, tell the delivery person and message us within 24 hours with photos.</p>`,
  },
  'refund-policy': {
    title: 'Refund Policy',
    body: `
<h2>Damaged or wrong items</h2>
<p>If a can arrives dented, leaking or different from what you ordered, contact us within 24 hours of delivery with your order number and a clear photo. We will replace the item or refund its value.</p>
<h2>Change of mind</h2>
<p>For food-safety reasons we cannot accept returns of opened or used cans. Unopened cartons in original condition may be returned within 3 days of delivery at the customer’s cost.</p>
<h2>Refund method</h2>
<p>Refunds are sent to the original payment method (bKash, Nagad or Rocket) within 3–5 working days after approval. For cash on delivery orders we refund to your mobile wallet.</p>`,
  },
  'privacy-policy': {
    title: 'Privacy Policy',
    body: `
<h2>What we collect</h2>
<p>When you place an order or create an account we collect your name, phone number, email (optional), delivery address and order details. We use this only to process and deliver your order and to contact you about it.</p>
<h2>How we use it</h2>
<ul>
<li>To confirm, pack and deliver your order.</li>
<li>To send order updates and, if you subscribe, occasional offers.</li>
<li>To improve our store and prevent fraud.</li>
</ul>
<h2>Sharing</h2>
<p>We share your name, phone number and address with our delivery partners so they can reach you. We never sell your data.</p>
<h2>Your choices</h2>
<p>You can ask us to update or delete your information at any time by contacting us.</p>`,
  },
  'terms-condition': {
    title: 'Terms & Conditions',
    body: `
<h2>Using this website</h2>
<p>By placing an order you agree that the details you provide are accurate and that you are legally able to make the purchase.</p>
<h2>Prices and stock</h2>
<p>All prices are in Bangladeshi Taka (৳) and include applicable taxes. Prices and availability may change without notice. If an item becomes unavailable after you order, we will contact you and offer a replacement or refund.</p>
<h2>Product information</h2>
<p>Product images are illustrations; the can design you receive may differ slightly because manufacturers update their packaging. Check the can label for ingredients, allergens and best-before dates.</p>
<h2>Brand names</h2>
<p>Brand names and trademarks belong to their respective owners. Drink it is an independent retailer and is not affiliated with the brands it sells.</p>
<h2>Contact</h2>
<p>Questions about these terms? Contact us using the details on our Contact page.</p>`,
  },
};
