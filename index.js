const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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
      let role = '';
      if (user) {
        role = user?.role;
      }

      res.send(role);
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

    // Agent Api

    // add property
    app.post('/properties', verifyToken, async (req, res) => {
      const property = req.body;
      const result = await propertyCollection.insertOne(property);
      res.send(result);
    });

    // get added properties for each agent
    app.get('/properties/:email', async (req, res) => {
      const query = { agentEmail: req.params.email };
      const result = await propertyCollection.find(query).toArray();
      res.send(result);
    });

    // get one property data
    app.get('/properties', async (req, res) => {
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

    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
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
