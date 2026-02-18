import express from "express";

const app = express();
const port = 8080;
const host = "localhost";

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from express server");
});

app.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
});
