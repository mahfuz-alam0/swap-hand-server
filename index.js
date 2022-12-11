const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

const app = express();
// app.use(express.static("public"));
app.use(cors());
app.use(express.json());

// BD_USER
// DB_PASS
// ACCESS_TOKEN



const uri = `mongodb+srv://${process.env.BD_USER}:${process.env.DB_PASS}@cluster0.3njemyu.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



function varifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(403).send({ message: "unauthorized Access" });
    } else {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
            if (err) {
                return res.status(403).send({ message: "Forbiden Access" });
            } else {
                req.decoded = decoded;
                next();
            }
        })
    }

}

async function run() {
    try {
        const users_collection = client.db("Swap_hand").collection("Users");
        const product_collection = client.db("Swap_hand").collection("Products");
        const add_collection = client.db("Swap_hand").collection("Advertisement");
        const order_collection = client.db("Swap_hand").collection("Orders");
        const payment_collection = client.db("Swap_hand").collection("Payment");
        const report_collection = client.db("Swap_hand").collection("Report");

        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await users_collection.findOne(query);
            if (user.role !== 'Admin') {
                return res.status(403).send({ message: 'you are not Admin' })
            } else {
                next();
            }
        }

        const verifySeller = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await users_collection.findOne(query);
            if (user.role !== 'Seller') {
                return res.status(403).send({ message: 'you are not Seller' })
            } else {
                next();
            }
        }

        app.post("/create-payment-intent", async (req, res) => {
            const order = req.body;
            const price = order.price;
            const amount = price * 100;
            if (amount) {
                const paymentIntent = await stripe.paymentIntents.create({
                    currency: "usd",
                    amount: amount,
                    "payment_method_types": [
                        "card"
                    ],
                });
                res.send({ clientSecret: paymentIntent.client_secret });
            }
        });

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;

            const query = { email: email };
            const user = await users_collection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '10h' });
                res.send({ accessToken: token });
            } else {
                res.status(401).send({ message: "unauthorized Access" });
            }
        });

        app.get('/users', async (req, res) => {
            const query = {};
            const users = await users_collection.find(query).toArray();
            res.send(users);
        });

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await users_collection.findOne(query);
            res.send({ isAdmin: user?.role === 'Admin' })
        })

        // app.get('/users/admin/:email', async (req, res) => {
        //     const email = req.params.email;
        //     const query = { email }
        //     const user = await users_collection.findOne(query);
        //     console.log(user)
        //     res.send({ isAdmin: user?.role === 'Admin' })
        // })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await users_collection.insertOne(user);
            res.send(result);
        });

        app.post('/users/social', async (req, res) => {
            const user = req.body;
            const email = user.email
            const query = { email: user.email };
            const userquery = await users_collection.findOne(query);
            if (!userquery) {
                const result = await users_collection.insertOne(user);
                res.send(result);
            } else {
                const data = { acknowledged: true }
                res.send(data)
            }
        });

        

        app.get('/users/seller/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await users_collection.findOne(query)
            res.send({ isSeller: user?.role === 'Seller', email: user?.email })
        })

        app.post('/products', varifyJWT, verifySeller, async (req, res) => {
            const product = req.body;
            const result = await product_collection.insertOne(product);
            res.send(result);
        });

        app.get('/products', async (req, res) => {
            const query = {};
            const products = await product_collection.find(query).toArray();
            res.send(products);
        });

        app.get('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const products = await product_collection.findOne(query);
            res.send(products);
        });

        app.get('/my-products/:email', varifyJWT, verifySeller, async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const products = await product_collection.find(query).toArray();
            res.send(products);
        });

        app.get('/seller-info/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const result = await users_collection.find(query).project({ name: 1, image: 2, isVarify: 3 }).toArray();
            res.send(result);
        });

        app.get('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await product_collection.findOne(query);
            res.send(result);
        });

        app.post('/advertisement', varifyJWT, verifySeller, async (req, res) => {
            const add = req.body;
            const query = { productId: add.productId }
            const filter = { _id: ObjectId(add.productId) }
            const updateDoc = { $set: { isAdvertisement: true } }
            const options = { upsert: true };
            const products = await product_collection.findOne(filter)
            if (products) {
                const updateproduct = await product_collection.updateOne(filter, updateDoc, options)
            }
            const result = await add_collection.findOne(query);
            if (result?.productId === add.productId) {
                res.status(403).send({ message: 'you are already add this product' });
            } else {
                const product = await add_collection.insertOne(add);
                res.send(product);
            }
        });

        app.get('/advertisement', async (req, res) => {
            const query = {};
            const result = await add_collection.find(query).toArray();
            res.send(result);
        });

        app.post('/orders', varifyJWT, async (req, res) => {
            const order = req.body;
            const result = await order_collection.insertOne(order);
            res.send(result);
        });

        app.get('/orders/:email', varifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { buyer: email };
            const result = await order_collection.find(query).toArray();
            res.send(result);
        });

        app.get('/my-orders', async (req, res) => {
            const id = req.query.id;
            const query = { _id: ObjectId(id) };
            const result = await order_collection.findOne(query);
            res.send(result);
        });

        app.post('/payment', varifyJWT, async (req, res) => {
            const payment = req.body;
            const result = await payment_collection.insertOne(payment);
            res.send(result);
        });

        app.post('/payment-order', varifyJWT, async (req, res) => {
            const payment_data = req.body;
            const order_filter = { _id: ObjectId(payment_data.orderId) };
            
            const options = { upsert: true };
            const updatedDoc = { $set: { payment: true } };
            const order_result = await order_collection.updateOne(order_filter, updatedDoc, options);
            const payment = await payment_collection.insertOne(payment_data);
            res.send(payment);
        });

        app.get('/buyer-info/:email', async (req, res) => {
            const email = req.params.email;
            console.log(email)
            const query = { email };
            const result = await users_collection.find(query).project({ name: 1, image: 2, isVarify: 3 }).toArray();
            res.send(result);
        });

        app.get('/buyers-orders/:email', async (req, res) => {
            const email = req.params.email;
            const query = {seller: email};
            const result = await order_collection.find(query).toArray();
            res.send(result);
        });

        app.get('/user/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const result = await users_collection.findOne(query);
            res.send(result);
        });

        app.get('/sellers', async(req, res) => {
            const query = { role: 'Seller' };
            // const query = {};
            const result = await users_collection.find(query).toArray();
            res.send(result);
        })

        app.put('/sellers/:id', varifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const updateDoc = { $set: { isVarify: true } };
            const options = { upsert: true };
            const result = await users_collection.updateOne(query, updateDoc, options);
            res.send(result);
        });

        app.delete('/sellers/:id', varifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await users_collection.deleteOne(query);
            res.send(result);
        })

        app.get('/buyers', async (req, res) => {
            const query = { role: 'Buyer' };
            const result = await users_collection.find(query).toArray();
            res.send(result);
        });

        app.get('/category/:cat', async (req, res) => {
            const cat = req.params.cat;
            const query = { category: cat };
            const result = await product_collection.find(query).toArray();
            res.send(result);
        });

        app.post('/report', async (req, res) => {
            const report = req.body;
            const result = await report_collection.insertOne(report);
            res.send(result);
        });

        app.get('/report', async (req, res) => {
            const query = {};
            const result = await report_collection.find(query).toArray();
            res.send(result);
        });

        // // /temporary update for price
        // app.get('/update_order/:id', async (req, res) => {
        //     const id = req.params.id;
        //     const query = { _id:ObjectId(id) };
        //     console.log(query)
        //     const preorder = await order_collection.findOne(query);
        //     console.log(preorder.productId);
        //     const product = await product_collection.findOne({ _id: ObjectId(preorder.productId) });
        //     console.log(product.productName);
        //     const options = { upsert: true };
        //     const updatedDoc = { $set: { productName: product.productName } };
        //     const result = await order_collection.updateMany(query, updatedDoc, options);
        //     res.send(result);
        // });

    }
    finally {

        // await client.close();
    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello World!');
})

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});