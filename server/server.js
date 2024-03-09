const fs = require("fs");
const express = require("express");
const React = require("react");
const path = require("path");
const ReactDOMServer = require("react-dom/server");
const { StaticRouter } = require("react-router-dom");
const { ApolloServer, gql } = require("apollo-server-express");
const { PubSub } = require("graphql-subscriptions");
const App = require("../client/src/App").default;

const {
  ApolloServerPluginDrainHttpServer,
} = require("@apollo/server/plugin/drainHttpServer");
const { makeExecutableSchema } = require("@graphql-tools/schema");
const { WebSocketServer } = require("ws");
const { useServer } = require("graphql-ws/lib/use/ws");

const app = express();
const PORT = process.env.PORT || 3001;

// Set up WebSocket server
const pubsub = new PubSub();
const httpServer = require("http").createServer(app);

const indexFile = path.resolve(__dirname, "../client/build/index.html");

// Serve static files from the client build directory
app.use(express.static(path.resolve(__dirname, "../client/build")));

const data = [
  {
    text: "6oNoTbgkYpvO1I1lYalx0flJ4mqmo4SlysC1r",
    id: 24186,
  },
  {
    text: "VpPqIlnp7B6qRfO0kjUbBJZSttgjdmdRRVY1CzncCV",
    id: 72818,
  },
  {
    text: "SlIshncYygFSOFI1kHLv1O",
    id: 38504,
  },
  {
    text: "yJ6U9WkivngkcodNoRCQtezQsOB2mr1g5IfHHVUGTr26b6",
    id: 62403,
  },
  {
    text: "TH0u1qgbbVxQB7EqEqOVPebt0JtAbdfCZnQvPn6XbMPuOcatk4eaCy",
    id: 93269,
  },
  {
    text: "rGg8jMAc4KOLkBzsvxsrAGH0oGlSldUb5xpIL",
    id: 35416,
  },
  {
    text: "wYIO9qN0kwQn4OdmQAdZVH6Jw54yflapqa6Kbo3",
    id: 63192,
  },
  {
    text: "uij4KLKglIo",
    id: 27937,
  },
];

const typeDefs = gql`
  type Record {
    text: String
    id: ID!
  }

  type UpdatedRecord {
    status: String
    id: ID!
  }

  type Query {
    searchResults(query: String): [Record]
  }

  type Mutation {
    updateText(text: String, id: ID!): UpdatedRecord
  }

  type Subscription {
    textUpdated: [Record]
  }
`;

const resolvers = {
  Query: {
    searchResults: (_, { query }) => {
      const response = data.filter((record) => {
        return record.text.includes(query);
      });

      return response;
    },
  },
  Mutation: {
    updateText: (parent, args) => {
      for (let index = 0; index < data.length; index++) {
        if (data[index].id == args.id) {
          data[index].text = args.text;
          break;
        }
      }

      pubsub.publish("TEXT_UPDATED", { textUpdated: data });
      return {
        status: "updated",
        id: args.id,
      };
    },
  },
  Subscription: {
    textUpdated: {
      subscribe: () => {
        try {
          console.log("Subscribing to TEXT_UPDATED...");
          return pubsub.asyncIterator("TEXT_UPDATED");
        } catch (error) {
          console.error("Error subscribing to TEXT_UPDATED:", error);
          throw error;
        }
      },
      resolve: (payload) => {
        console.log("Received TEXT_UPDATED event:", payload.textUpdated);
        return payload.textUpdated;
      },
    },
  },
};

async function startServer() {
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/graphql",
  });

  const serverCleanup = useServer({ schema }, wsServer);

  const apolloServer = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),

      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
    graphiql: true,
  });

  await apolloServer.start();

  apolloServer.applyMiddleware({ app });

  httpServer.listen(PORT, () => {
    console.log(
      `🚀 Server ready at http://localhost:${PORT}${apolloServer.graphqlPath}`
    );
    console.log(
      `🚀 Subscriptions ready at ws://localhost:${PORT}${apolloServer.graphqlPath}`
    );
  });
}

startServer();

app.get("*", (req, res) => {
  const context = {};
  const appMarkup = ReactDOMServer.renderToString(
    <StaticRouter location={req.url} context={context}>
      <App />
    </StaticRouter>
  );

  fs.readFile(indexFile, "utf-8", (err, data) => {
    if (err) {
      console.error("Error reading index.html:", err);
      return res.status(500).send("Error!");
    }
    return res.send(
      data.replace('<div id="root"></div>', `<div id="root">${appMarkup}</div>`)
    );
  });
});
