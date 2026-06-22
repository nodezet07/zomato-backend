import "dotenv/config";
import connectDB from "../config/db.js";
import logger from "../config/logger.js";
import User from "../models/user.model.js";
import Restaurant from "../models/restaurant.model.js";
import MenuCategory from "../models/menuCategory.model.js";
import MenuItem from "../models/menuItem.model.js";
import crypto from "crypto";
import mongoose from "mongoose";
import {
  AccountStatus,
  FoodType,
  RestaurantStatus,
  UserRole,
} from "../types/enums.js";

type SeedRestaurant = {
  ownerEmail: string;
  ownerName: string;
  restaurantName: string;
  slug: string;
  description: string;
  cuisines: string[];
  latitude: number;
  longitude: number;
  categories: Array<{
    name: string;
    image?: string;
    sortOrder: number;
    items: Array<{
      itemName: string;
      slug: string;
      description: string;
      price: number;
      foodType: FoodType;
      images?: string[];
      isRecommended?: boolean;
      addons?: Array<{ name: string; price: number; isAvailable: boolean }>;
    }>;
  }>;
};

const FOOD_IMAGES: Record<string, string> = {
  biryani: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80",
  kebab: "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=600&auto=format&fit=crop&q=80",
  margherita: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&auto=format&fit=crop&q=80",
  pepperoni: "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&auto=format&fit=crop&q=80",
  pizza: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80",
  garlic: "https://images.unsplash.com/photo-1573140247632-f8fd74997d5c?w=600&auto=format&fit=crop&q=80",
  salad: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80",
  bowl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
  smoothie: "https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80",
  lemonade: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80",
  burger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80",
  cake: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop&q=80",
  combo: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
  special: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop&q=80",
  logo: "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=300&auto=format&fit=crop&q=80",
  banner: "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=1000&auto=format&fit=crop&q=80",
};

function img(seed: string, w = 1200, h = 800) {
  const lower = seed.toLowerCase();
  for (const [key, url] of Object.entries(FOOD_IMAGES)) {
    if (lower.includes(key)) {
      return url;
    }
  }
  const fallbacks = [
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600&auto=format&fit=crop&q=80"
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % fallbacks.length;
  return fallbacks[index];
}

const DATA: SeedRestaurant[] = [
  {
    ownerEmail: "owner@foodapp.com",
    ownerName: "Demo Restaurant Owner",
    restaurantName: "Demo Biryani House",
    slug: "demo-biryani-house",
    description: "Authentic biryani and kebabs",
    cuisines: ["Indian", "Mughlai"],
    latitude: 19.076,
    longitude: 72.8777,
    categories: [
      {
        name: "Biryani",
        image: img("cat-biryani", 256, 256),
        sortOrder: 1,
        items: [
          {
            itemName: "Chicken Biryani",
            slug: "chicken-biryani",
            description: "Fragrant basmati rice with spiced chicken",
            price: 299,
            foodType: FoodType.NONVEG,
            images: [img("chicken-biryani-1"), img("chicken-biryani-2")],
            isRecommended: true,
            addons: [
              { name: "Portion: Half", price: 0, isAvailable: true },
              { name: "Portion: Full", price: 150, isAvailable: true },
              { name: "Extra Chicken Piece", price: 80, isAvailable: true },
              { name: "Extra Raita", price: 20, isAvailable: true }
            ]
          },
          {
            itemName: "Veg Dum Biryani",
            slug: "veg-dum-biryani",
            description: "Slow-cooked biryani with seasonal veggies",
            price: 249,
            foodType: FoodType.VEG,
            images: [img("veg-dum-biryani-1"), img("veg-dum-biryani-2")],
            addons: [
              { name: "Portion: Half", price: 0, isAvailable: true },
              { name: "Portion: Full", price: 120, isAvailable: true },
              { name: "Extra Salan", price: 15, isAvailable: true }
            ]
          },
        ],
      },
      {
        name: "Kebabs",
        image: img("cat-kebabs", 256, 256),
        sortOrder: 2,
        items: [
          {
            itemName: "Seekh Kebab (6 pcs)",
            slug: "seekh-kebab-6",
            description: "Juicy minced kebabs with house spices",
            price: 329,
            foodType: FoodType.NONVEG,
            images: [img("seekh-kebab-1"), img("seekh-kebab-2")],
            addons: [
              { name: "Portion: Half (3 pcs)", price: 0, isAvailable: true },
              { name: "Portion: Full (6 pcs)", price: 150, isAvailable: true },
              { name: "Extra Mint Chutney", price: 10, isAvailable: true }
            ]
          },
        ],
      },
    ],
  },
  {
    ownerEmail: "pizza@foodapp.com",
    ownerName: "Demo Pizza Owner",
    restaurantName: "QuickSlice Pizza",
    slug: "quickslice-pizza",
    description: "Wood-fired pizzas, sides, and shakes",
    cuisines: ["Italian", "Fast Food"],
    latitude: 19.0902,
    longitude: 72.8686,
    categories: [
      {
        name: "Pizzas",
        image: img("cat-pizza", 256, 256),
        sortOrder: 1,
        items: [
          {
            itemName: "Margherita",
            slug: "margherita",
            description: "Classic cheese pizza with basil",
            price: 299,
            foodType: FoodType.VEG,
            images: [img("margherita-1"), img("margherita-2")],
            isRecommended: true,
            addons: [
              { name: "Portion: Regular", price: 0, isAvailable: true },
              { name: "Portion: Medium", price: 120, isAvailable: true },
              { name: "Portion: Large", price: 220, isAvailable: true },
              { name: "Extra Cheese", price: 50, isAvailable: true }
            ]
          },
          {
            itemName: "Pepperoni",
            slug: "pepperoni",
            description: "Pepperoni, mozzarella, and tomato sauce",
            price: 399,
            foodType: FoodType.NONVEG,
            images: [img("pepperoni-1"), img("pepperoni-2")],
            addons: [
              { name: "Portion: Regular", price: 0, isAvailable: true },
              { name: "Portion: Medium", price: 150, isAvailable: true },
              { name: "Portion: Large", price: 280, isAvailable: true }
            ]
          },
        ],
      },
      {
        name: "Sides",
        image: img("cat-sides", 256, 256),
        sortOrder: 2,
        items: [
          {
            itemName: "Garlic Bread",
            slug: "garlic-bread",
            description: "Toasted bread with garlic butter",
            price: 159,
            foodType: FoodType.VEG,
            images: [img("garlic-bread-1"), img("garlic-bread-2")],
          },
        ],
      },
    ],
  },
  {
    ownerEmail: "bowls@foodapp.com",
    ownerName: "Demo Healthy Owner",
    restaurantName: "GreenBowl Kitchen",
    slug: "greenbowl-kitchen",
    description: "Healthy bowls, smoothies, and salads",
    cuisines: ["Healthy", "Continental"],
    latitude: 19.12,
    longitude: 72.91,
    categories: [
      {
        name: "Bowls",
        image: img("cat-bowls", 256, 256),
        sortOrder: 1,
        items: [
          {
            itemName: "Chicken Protein Bowl",
            slug: "chicken-protein-bowl",
            description: "Grilled chicken, quinoa, greens, and sauce",
            price: 449,
            foodType: FoodType.NONVEG,
            images: [img("protein-bowl-1"), img("protein-bowl-2")],
            isRecommended: true,
          },
          {
            itemName: "Paneer Power Bowl",
            slug: "paneer-power-bowl",
            description: "Paneer, brown rice, veggies, and dressing",
            price: 399,
            foodType: FoodType.VEG,
            images: [img("paneer-bowl-1"), img("paneer-bowl-2")],
          },
        ],
      },
      {
        name: "Smoothies",
        image: img("cat-smoothies", 256, 256),
        sortOrder: 2,
        items: [
          {
            itemName: "Mango Oats Smoothie",
            slug: "mango-oats-smoothie",
            description: "Mango, oats, yogurt, and honey",
            price: 219,
            foodType: FoodType.VEG,
            images: [img("mango-smoothie-1"), img("mango-smoothie-2")],
          },
        ],
      },
    ],
  },
];

function buildExtraRestaurants(count: number): SeedRestaurant[] {
  const names = [
    "Spice Route Kitchen",
    "Curry & Co.",
    "Tandoor Tales",
    "StreetBite Express",
    "Saffron Symphony",
    "Noodle Nation",
    "Burger Boulevard",
    "Sushi Sprint",
    "Dosa Depot",
    "Kebab Kingdom",
    "Pasta Piazza",
    "Chaat Corner",
    "Bowl & Brew",
    "Dessert District",
    "Wrap Works",
    "Salad Studio",
    "Roll Royale",
    "Taco Town",
  ];
  const cuisinesPool = [
    ["Indian", "North Indian"],
    ["South Indian", "Indian"],
    ["Chinese", "Asian"],
    ["Italian", "Fast Food"],
    ["American", "Fast Food"],
    ["Japanese", "Sushi"],
    ["Healthy", "Continental"],
  ];

  const baseLat = 19.076;
  const baseLng = 72.8777;

  const out: SeedRestaurant[] = [];
  for (let i = 0; i < count; i++) {
    const name = names[i % names.length] + (i >= names.length ? ` ${i + 1}` : "");
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") + "-demo";
    const cuisines = cuisinesPool[i % cuisinesPool.length];

    const latitude = baseLat + (i % 5) * 0.006 + Math.floor(i / 5) * 0.002;
    const longitude = baseLng + (i % 4) * 0.006 + Math.floor(i / 4) * 0.002;

    out.push({
      ownerEmail: `demo-owner-${i + 1}@foodapp.com`,
      ownerName: `Demo Owner ${i + 1}`,
      restaurantName: name,
      slug,
      description: "Demo restaurant for app browsing and ordering",
      cuisines,
      latitude,
      longitude,
      categories: [
        {
          name: "Popular",
          image: img(`cat-popular-${i + 1}`, 256, 256),
          sortOrder: 1,
          items: [
            {
              itemName: "Chef's Special",
              slug: `chefs-special-${i + 1}`,
              description: "Signature dish loved by customers",
              price: 199 + (i % 6) * 40,
              foodType: i % 2 === 0 ? FoodType.VEG : FoodType.NONVEG,
              images: [img(`chefs-special-${i + 1}-1`), img(`chefs-special-${i + 1}-2`)],
              isRecommended: true,
              addons: [
                { name: "Portion: Half", price: 0, isAvailable: true },
                { name: "Portion: Full", price: 100, isAvailable: true }
              ]
            },
            {
              itemName: "Classic Combo",
              slug: `classic-combo-${i + 1}`,
              description: "A balanced meal combo",
              price: 249 + (i % 5) * 35,
              foodType: FoodType.VEG,
              images: [img(`classic-combo-${i + 1}-1`), img(`classic-combo-${i + 1}-2`)],
              addons: [
                { name: "Portion: Regular", price: 0, isAvailable: true },
                { name: "Portion: Medium", price: 80, isAvailable: true },
                { name: "Portion: Large", price: 150, isAvailable: true }
              ]
            },
          ],
        },
        {
          name: "Beverages",
          image: img(`cat-beverages-${i + 1}`, 256, 256),
          sortOrder: 2,
          items: [
            {
              itemName: "Masala Lemonade",
              slug: `masala-lemonade-${i + 1}`,
              description: "Refreshing lemonade with spice twist",
              price: 99,
              foodType: FoodType.VEG,
              images: [img(`lemonade-${i + 1}-1`), img(`lemonade-${i + 1}-2`)],
            },
          ],
        },
      ],
    });
  }
  return out;
}

// Total restaurants: existing (3) + extras (12) = 15
const ALL_RESTAURANTS: SeedRestaurant[] = [...DATA, ...buildExtraRestaurants(12)];

async function upsertOwner(ownerEmail: string, ownerName: string) {
  let owner = await User.findOne({ email: ownerEmail });
  if (!owner) {
    // Mobile is unique in DB. Generate a deterministic unique 10-digit mobile per owner email.
    // Keep it numeric and 10 digits (India-style), stable across runs.
    const hex = crypto.createHash("sha256").update(ownerEmail).digest("hex");
    const n = BigInt("0x" + hex.slice(0, 12));
    // 10 digits, always starts with 9 to avoid leading zeros.
    const mobile = (9000000000n + (n % 1000000000n)).toString();
    owner = await User.create({
      fullName: ownerName,
      email: ownerEmail,
      mobile,
      role: UserRole.RESTAURANT_OWNER,
      accountStatus: AccountStatus.ACTIVE,
      isEmailVerified: true,
    });
    logger.info("Created owner", { ownerEmail });
  }
  return owner;
}

async function upsertRestaurant(seed: SeedRestaurant, ownerId: mongoose.Types.ObjectId) {
  let restaurant = await Restaurant.findOne({ slug: seed.slug });
  if (!restaurant) {
    restaurant = await Restaurant.create({
      ownerId,
      restaurantName: seed.restaurantName,
      slug: seed.slug,
      description: seed.description,
      logo: img(`logo-${seed.slug}`, 256, 256),
      bannerImages: [img(`banner-${seed.slug}-1`, 1200, 800), img(`banner-${seed.slug}-2`, 1200, 800)],
      cuisines: seed.cuisines,
      tags: seed.cuisines,
      location: { type: "Point", coordinates: [seed.longitude, seed.latitude] },
      latitude: seed.latitude,
      longitude: seed.longitude,
      restaurantStatus: RestaurantStatus.APPROVED,
      isOpen: true,
      averageRating: 4.4,
      totalRatings: 40,
    });
    logger.info("Created restaurant", { slug: seed.slug });
  } else {
    restaurant.ownerId = ownerId;
    restaurant.restaurantStatus = RestaurantStatus.APPROVED;
    restaurant.isOpen = true;
    restaurant.logo = img(`logo-${seed.slug}`, 256, 256);
    restaurant.bannerImages = [img(`banner-${seed.slug}-1`, 1200, 800), img(`banner-${seed.slug}-2`, 1200, 800)];
    await restaurant.save();
  }
  return restaurant;
}

async function upsertCategory(restaurantId: mongoose.Types.ObjectId, name: string, sortOrder: number) {
  let cat = await MenuCategory.findOne({ restaurantId, categoryName: name });
  if (!cat) {
    cat = await MenuCategory.create({
      restaurantId,
      categoryName: name,
      categoryImage: img(`cat-${String(name).toLowerCase()}`, 256, 256),
      sortOrder,
    });
    logger.info("Created category", { name });
  }
  return cat;
}

async function upsertItem(args: {
  restaurantId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  itemName: string;
  slug: string;
  description: string;
  price: number;
  foodType: FoodType;
  images?: string[];
  isRecommended?: boolean;
  addons?: Array<{ name: string; price: number; isAvailable: boolean }>;
}) {
  const exists = await MenuItem.findOne({ restaurantId: args.restaurantId, slug: args.slug });
  if (exists) {
    exists.foodType = args.foodType;
    exists.images = args.images ?? [img(`item-${args.slug}-1`, 1200, 800), img(`item-${args.slug}-2`, 1200, 800)];
    exists.isRecommended = Boolean(args.isRecommended);
    exists.addons = args.addons ?? [];
    await exists.save();
    return;
  }
  await MenuItem.create({
    restaurantId: args.restaurantId,
    categoryId: args.categoryId,
    itemName: args.itemName,
    slug: args.slug,
    description: args.description,
    images: args.images ?? [img(`item-${args.slug}-1`, 1200, 800), img(`item-${args.slug}-2`, 1200, 800)],
    price: args.price,
    foodType: args.foodType,
    isRecommended: Boolean(args.isRecommended),
    addons: args.addons ?? [],
  });
  logger.info("Created menu item", { slug: args.slug });
}

async function seedDemoCatalog() {
  await connectDB();

  for (const r of ALL_RESTAURANTS) {
    const owner = await upsertOwner(r.ownerEmail, r.ownerName);
    const restaurant = await upsertRestaurant(r, owner._id);

    for (const c of r.categories) {
      const category = await upsertCategory(restaurant._id, c.name, c.sortOrder);
      for (const item of c.items) {
        await upsertItem({
          restaurantId: restaurant._id,
          categoryId: category._id,
          ...item,
        });
      }
    }
  }

  logger.info("Demo catalog seed completed");
  process.exit(0);
}

seedDemoCatalog();

