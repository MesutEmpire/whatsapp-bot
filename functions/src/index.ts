const functions = require('firebase-functions');
import {Request,Response,NextFunction,Application} from "express";
const express = require('express');
const { Configuration, OpenAIApi } = require("openai");
const request = require('request');
const cors = require('cors');
require('dotenv').config()

//Start Express App
const app:Application = express();


const configuration = new Configuration({
    organization: process.env.ORGANIZATION,
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

//enable all CORS requests
app.use(cors({ origin: true, credentials: true }));

//middleware
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(req.path, req.method);
    next();
});


// routes
app.get("/", (req: Request, res: Response) => {
    res.status(200).json(`Successfull hit to Openai-Whatsapp at path ${req.path}` )
})
app.get("/webhook/whatsapp", (req: Request, res: Response) => {
    const verify_token = process.env.VERIFY_TOKEN;

    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    if (mode && token) {
        if (mode === "subscribe" && token === verify_token) {
            console.log("WEBHOOK_VERIFIED");
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});
app.post("/webhook/whatsapp", (req: Request, res: Response) => {
    if (req.body.object) {
        if (
            req.body.entry &&
            req.body.entry[0].changes &&
            req.body.entry[0].changes[0] &&
            req.body.entry[0].changes[0].value.messages &&
            req.body.entry[0].changes[0].value.messages[0]
        ) {
            let phone_number_id =req.body.entry[0].changes[0].value.metadata.phone_number_id;
            let from = req.body.entry[0].changes[0].value.messages[0].from; // extract the phone number from the webhook payload
            let msg_body = req.body.entry[0].changes[0].value.messages[0].text.body; // extract the message text from the webhook payload


            console.log(msg_body)
            openai.createCompletion({
                model: 'text-davinci-001',
                prompt: msg_body,
                max_tokens: 100,
                temperature: 0,
            })
                .then((response:any) => {
                    console.log(`This is the Response from OpenAI : ${response.data.choices[0].text}`)

                    request({
                        url: 'https://graph.facebook.com/v15.0/' + phone_number_id + '/messages?access_token=' + process.env.WHATSAPP_TOKEN,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        json: {
                            messaging_product: 'whatsapp',
                            to: from,
                            text: { body: `${response.data.choices[0].text}`  }
                        }
                        // @ts-ignore
                    }, (error:any, response:any,body:any) => {
                        if (error) {
                            console.error(`Error from Request to Meta ${error}`);
                            return res.sendStatus(500);
                        }
                        console.log(`Status Code for the Response from Meta ${response.statusCode}`)
                        res.end();
                    });

                })
                .catch((err:any) =>{
                    console.log("ERROR Openai")
                    console.log(err.message)
                })

        }
        // res.sendStatus(200);
    } else {
        // Return a '404 Not Found' if event is not from a WhatsApp API
        res.sendStatus(404);
    }
});

// Export the Cloud Function
exports.api = functions.https.onRequest(app);
