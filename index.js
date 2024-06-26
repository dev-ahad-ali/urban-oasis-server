const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

//middleware
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://urban-oasis-indev.firebaseapp.com',
      'https://urban-oasis-indev.web.app',
      //   'https://api.imgbb.com/1/upload?key=c572304118635f890be893cfe3c041',
    ],
    optionsSuccessStatus: 200,
  })
);
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rocppxe.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection

    const userCollection = client.db('urbanOasis').collection('users');
    const propertyCollection = client.db('urbanOasis').collection('properties');
    const wishCollection = client.db('urbanOasis').collection('wishes');
    const offerCollection = client.db('urbanOasis').collection('offers');
    const reviewCollection = client.db('urbanOasis').collection('reviews');

    // verify token middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Unauthorized access' });
      }

      const token = req.headers.authorization.split(' ')[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: 'Unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
    };

    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    };

    // JWT
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '364d',
      });
      res.send({ token });
    });

    // User Management Related Api

    // add user data on the database
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'user already exist', insertedId: null });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // get all users from database
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    // check user role
    app.get('/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send(user?.role);
    });

    // update user role
    app.patch('/users/:email', verifyToken, verifyAdmin, async (req, res) => {
      const query = { email: req.params.email };
      const updatedDoc = {
        $set: {
          role: req.body.role,
        },
      };
      const result = await userCollection.updateOne(query, updatedDoc);

      res.send(result);
    });

    // delete user
    app.delete('/users/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await userCollection.deleteOne(query);

      res.send(result);
    });

    // get property for advertise
    app.get('/advertiseProperties', async (req, res) => {
      const query = { status: 'verified' };
      const result = await propertyCollection.find(query).toArray();

      res.send(result);
    });

    // delete fraud property
    app.delete('/deleteProperties/:email', async (req, res) => {
      const query = { agentEmail: req.params.email };
      const result = await propertyCollection.deleteMany(query);
      res.send(result);
    });

    // advertise property
    app.patch('/advertiseProperty/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const updatedDoc = {
        $set: {
          advertise: 'accepted',
        },
      };
      const result = await propertyCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // home page display properties
    app.get('/displayProperties', async (req, res) => {
      const query = { advertise: 'accepted' };
      const result = await propertyCollection.find(query).sort({ _id: -1 }).toArray();
      res.send(result);
    });

    // latest reviews
    app.get('/latestReviews', async (req, res) => {
      const result = await reviewCollection.find().sort({ _id: -1 }).toArray();
      res.send(result);
    });

    // Agent Api

    // add property
    app.post('/properties', verifyToken, async (req, res) => {
      const property = req.body;
      const result = await propertyCollection.insertOne(property);
      res.send(result);
    });

    // update property
    app.patch('/property/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const update = req.body;
      const updatedDoc = {
        $set: {
          title: update.title,
          location: update.location,
          image: update.image,
          minPrice: update.minPrice,
          maxPrice: update.maxPrice,
        },
      };
      const result = await propertyCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // get all properties
    app.get('/properties', verifyToken, async (req, res) => {
      const result = await propertyCollection.find().toArray();
      res.send(result);
    });

    // get added properties for each agent
    app.get('/properties/:email', async (req, res) => {
      const query = { agentEmail: req.params.email };
      const result = await propertyCollection.find(query).toArray();
      res.send(result);
    });

    // get one property data
    app.get('/property', async (req, res) => {
      const query = { _id: new ObjectId(req.query.id) };
      const result = await propertyCollection.findOne(query);
      res.send(result);
    });

    // delete Property
    app.delete('/properties/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await propertyCollection.deleteOne(query);
      res.send(result);
    });

    // verify or reject property
    app.patch('/propertyVerify/:id', verifyToken, async (req, res) => {
      const status = req.body.status;
      const query = { _id: new ObjectId(req.params.id) };
      const updatedDoc = {
        $set: {
          status: status,
        },
      };
      const result = await propertyCollection.updateOne(query, updatedDoc);

      res.send(result);
    });

    // post review
    app.post('/reviews', async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });

    // get review based on user
    app.get('/reviews/:email', async (req, res) => {
      const email = req.params.email;
      const query = { reviewerEmail: email };
      const result = await reviewCollection.find(query).toArray();
      return res.send(result);
    });

    // ger all review
    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      return res.send(result);
    });

    // get review for each property
    app.get('/review/:propertyId', async (req, res) => {
      const query = { propertyId: req.params.propertyId };
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });

    // delete review
    app.delete('/reviews/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await reviewCollection.deleteOne(query);
      res.send(result);
    });

    // user related api
    app.get('/allProperties', verifyToken, async (req, res) => {
      const query = { status: 'verified', location: { $regex: req.query.location, $options: 'i' } };
      const priceSort = req.query.sort;
      if (!priceSort) {
        const result = await propertyCollection.find(query).toArray();
        return res.send(result);
      }
      const result = await propertyCollection
        .find(query)
        .sort({ minPrice: priceSort === 'low' ? 1 : -1 })
        .toArray();
      res.send(result);
    });

    // add to wish list api
    app.post('/wishList', async (req, res) => {
      const item = req.body;
      const result = await wishCollection.insertOne(item);
      res.send(result);
    });

    // get user specific wish list data
    app.get('/wishList/:email', async (req, res) => {
      const query = { userEmail: req.params.email };
      const result = await wishCollection.find(query).toArray();
      res.send(result);
    });

    // delete wish list item
    app.delete('/wishList/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await wishCollection.deleteOne(query);
      res.send(result);
    });

    // send offer api
    app.post('/offers', async (req, res) => {
      const offer = req.body;
      const result = await offerCollection.insertOne(offer);
      res.send(result);
    });

    // get offers made by user
    app.get('/offers/:email', async (req, res) => {
      const query = { buyerEmail: req.params.email };
      const result = await offerCollection.find(query).toArray();
      res.send(result);
    });

    // get offers for agent
    app.get('/agentOffers/:email', async (req, res) => {
      const query = { agentEmail: req.params.email };
      const result = await offerCollection.find(query).toArray();
      res.send(result);
    });

    // accept or reject offer
    app.patch('/offers/:id', async (req, res) => {
      const status = req.body.status;

      if (status === 'rejected') {
        const query = { _id: new ObjectId(req.params.id) };
        const updatedDoc = {
          $set: {
            status: status,
          },
        };
        const result = await offerCollection.updateOne(query, updatedDoc);
        res.send(result);
      }

      if (status === 'accepted') {
        const query = { _id: new ObjectId(req.params.id) };
        const updatedDoc = {
          $set: {
            status: status,
          },
        };
        const result = await offerCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    });

    // auto reject similar offer
    app.patch('/offersAutoReject', async (req, res) => {
      const propertyId = req.body.propertyId;
      const query = { propertyId: propertyId, status: 'pending' };
      const updatedDoc = {
        $set: {
          status: 'rejected',
        },
      };
      const result = await offerCollection.updateMany(query, updatedDoc);
      res.send(result);
    });

    // get sold properties
    app.get('/soldProperties/:email', async (req, res) => {
      const query = { agentEmail: req.params.email, propertyBought: 'bought' };
      const result = await propertyCollection.find(query).toArray();
      const count = await propertyCollection.countDocuments(query);
      res.send({ result, count });
    });

    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price ? price * 100 : 60);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // save payment details
    app.patch('/propertyBought/:id', async (req, res) => {
      const paymentInfo = req.body;
      const query = { _id: new ObjectId(req.params.id) };
      const updatedDoc = {
        $set: {
          propertyBought: 'bought',
          paymentInfo: paymentInfo,
        },
      };

      const result = await propertyCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // await client.db('admin').command({ ping: 1 });
    // console.log('Pinged your deployment. You successfully connected to MongoDB!');
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Urban Oasis Server is Running');
});

app.listen(port, () => {
  console.log(`Urban Oasis Server is running at ${port}`);
});
