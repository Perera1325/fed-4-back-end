import express from "express";
import { getWeatherForUser } from "../application/weather";
import { authenticationMiddleware } from "./middlewares/authentication-middleware";

const weatherRouter = express.Router();

weatherRouter.route("/me").get(authenticationMiddleware, getWeatherForUser);

export default weatherRouter;