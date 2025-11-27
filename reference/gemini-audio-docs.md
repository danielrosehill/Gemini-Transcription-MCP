# Audio Understanding with Gemini API

> Source: https://ai.google.dev/gemini-api/docs/audio

The Gemini API can process audio, enabling use cases like the following:

- Describe, summarize, or answer questions about audio content.
- Provide a transcription of the audio.
- Provide answers or a transcription about a specific segment of the audio.

## Before you begin

Before calling the Gemini API, ensure you have your SDK of choice installed and an API key configured.

## Audio input

You can provide audio to Gemini in the following ways:

- Upload an audio file using the File API before making the request to `generateContent`. Use this method for files larger than 20 MB, or when you want to reuse the file across multiple requests.
- Pass inline audio data with the request to `generateContent`.

### Upload an audio file

You can use the Files API to upload an audio file. Always use the Files API when the total request size (including the files, text prompt, system instructions, etc.) is larger than 20 MB, or if you intend to use the audio in multiple prompts.

The following code uploads an audio file and then uses it in a call to `generateContent`.

#### Python

```python
from google import genai

client = genai.Client(api_key="GEMINI_API_KEY")

myfile = client.files.upload(file="path/to/sample.mp3")

response = client.models.generate_content(
    model="gemini-2.0-flash", contents=["Describe this audio clip", myfile]
)

print(response.text)
```

#### JavaScript

```javascript
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
  const myfile = await ai.files.upload({
    file: "path/to/sample.mp3",
    config: { mimeType: "audio/mpeg" },
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: createUserContent([
      createPartFromUri(myfile.uri, myfile.mimeType),
      "Describe this audio clip",
    ]),
  });
  console.log(response.text);
}

await main();
```

#### Go

```go
file, err := client.UploadFileFromPath(ctx, "path/to/sample.mp3", nil)
if err != nil {
    log.Fatal(err)
}
defer client.DeleteFile(ctx, file.Name)

model := client.GenerativeModel("gemini-2.0-flash")
resp, err := model.GenerateContent(ctx,
    genai.FileData{URI: file.URI},
    genai.Text("Describe this audio clip"))
if err != nil {
    log.Fatal(err)
}

printResponse(resp)
```

#### REST

```bash
AUDIO_PATH="path/to/sample.mp3"
MIME_TYPE=$(file -b --mime-type "${AUDIO_PATH}")
NUM_BYTES=$(wc -c < "${AUDIO_PATH}")
DISPLAY_NAME=AUDIO

tmp_header_file=upload-header.tmp

# Initial resumable request defining metadata.
# The upload url is in the response headers dump them to a file.
curl "${BASE_URL}/upload/v1beta/files?key=${GOOGLE_API_KEY}" \
  -D upload-header.tmp \
  -H "X-Goog-Upload-Protocol: resumable" \
  -H "X-Goog-Upload-Command: start" \
  -H "X-Goog-Upload-Header-Content-Length: ${NUM_BYTES}" \
  -H "X-Goog-Upload-Header-Content-Type: ${MIME_TYPE}" \
  -H "Content-Type: application/json" \
  -d "{'file': {'display_name': '${DISPLAY_NAME}'}}" 2> /dev/null

upload_url=$(grep -i "x-goog-upload-url: " "${tmp_header_file}" | cut -d" " -f2 | tr -d "\r")
rm "${tmp_header_file}"

# Upload the actual bytes.
curl "${upload_url}" \
  -H "Content-Length: ${NUM_BYTES}" \
  -H "X-Goog-Upload-Offset: 0" \
  -H "X-Goog-Upload-Command: upload, finalize" \
  --data-binary "@${AUDIO_PATH}" 2> /dev/null > file_info.json

file_uri=$(jq -r ".file.uri" file_info.json)
echo file_uri=$file_uri

# Now generate content using that file
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GOOGLE_API_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
      "contents": [{
        "parts":[
          {"file_data":{"mime_type": "'"${MIME_TYPE}"'", "file_uri": "'"${file_uri}"'"}},
          {"text": "Describe this audio clip"}]
        }]
       }' 2> /dev/null > response.json

cat response.json
echo
```

### Pass audio data inline

Instead of uploading an audio file, you can pass audio data inline in the request to `generateContent`. This is suitable for smaller audio files (less than 20 MB total request size).

#### Python

```python
from google.genai import types

with open("path/to/small-sample.mp3", "rb") as f:
    audio_data = f.read()

response = client.models.generate_content(
    model="gemini-2.0-flash",
    contents=[
        "Describe this audio clip",
        types.Part.from_bytes(data=audio_data, mime_type="audio/mp3"),
    ],
)

print(response.text)
```

#### JavaScript

```javascript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });
const model = "gemini-2.0-flash";

async function main() {
  const audioBuffer = fs.readFileSync("path/to/small-sample.mp3");

  // Convert audio bytes to base64 string
  const base64Audio = audioBuffer.toString("base64");

  const contents = [
    {
      inlineData: {
        mimeType: "audio/mp3",
        data: base64Audio,
      },
    },
    { text: "Describe this audio clip" },
  ];

  const response = await ai.models.generateContent({
    model: model,
    contents: contents,
  });
  console.log(response.text);
}

await main();
```

#### Go

```go
model := client.GenerativeModel("gemini-2.0-flash")

bytes, err := os.ReadFile("path/to/small-sample.mp3")
if err != nil {
    log.Fatal(err)
}

resp, err := model.GenerateContent(ctx,
    genai.Blob{MIMEType: "audio/mp3", Data: bytes},
    genai.Text("Describe this audio clip"))
if err != nil {
    log.Fatal(err)
}

printResponse(resp)
```

#### REST

```bash
AUDIO_PATH="path/to/small-sample.mp3"

if [[ "$(base64 --version 2>&1)" = *"invalid"* ]]; then
  B64FLAGS="--input"
else
  B64FLAGS="-w0"
fi

curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GOOGLE_API_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
      "contents": [{
        "parts":[
            {
              "inline_data": {
                "mime_type":"audio/mp3",
                "data": "'$(base64 $B64FLAGS $AUDIO_PATH)'"
              }
            },
            {"text": "Describe this audio clip"}
        ]
      }]
    }' 2> /dev/null
```

## Get a transcript

To get a transcript of the audio, just ask for it in the prompt:

#### Python

```python
myfile = client.files.upload(file="path/to/sample.mp3")
response = client.models.generate_content(
    model="gemini-2.0-flash", contents=[myfile, "Generate a transcript of the speech."]
)
print(response.text)
```

#### JavaScript

```javascript
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
  const myfile = await ai.files.upload({
    file: "path/to/sample.mp3",
    config: { mimeType: "audio/mpeg" },
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: createUserContent([
      createPartFromUri(myfile.uri, myfile.mimeType),
      "Generate a transcript of the speech.",
    ]),
  });
  console.log(response.text);
}

await main();
```

#### Go

```go
file, err := client.UploadFileFromPath(ctx, "path/to/sample.mp3", nil)
if err != nil {
    log.Fatal(err)
}
defer client.DeleteFile(ctx, file.Name)

model := client.GenerativeModel("gemini-2.0-flash")
resp, err := model.GenerateContent(ctx,
    genai.FileData{URI: file.URI},
    genai.Text("Generate a transcript of the speech."))
if err != nil {
    log.Fatal(err)
}

printResponse(resp)
```

#### REST

```bash
AUDIO_PATH="path/to/sample.mp3"
MIME_TYPE=$(file -b --mime-type "${AUDIO_PATH}")
NUM_BYTES=$(wc -c < "${AUDIO_PATH}")
DISPLAY_NAME=AUDIO

tmp_header_file=upload-header.tmp

curl "${BASE_URL}/upload/v1beta/files?key=${GOOGLE_API_KEY}" \
  -D upload-header.tmp \
  -H "X-Goog-Upload-Protocol: resumable" \
  -H "X-Goog-Upload-Command: start" \
  -H "X-Goog-Upload-Header-Content-Length: ${NUM_BYTES}" \
  -H "X-Goog-Upload-Header-Content-Type: ${MIME_TYPE}" \
  -H "Content-Type: application/json" \
  -d "{'file': {'display_name': '${DISPLAY_NAME}'}}" 2> /dev/null

upload_url=$(grep -i "x-goog-upload-url: " "${tmp_header_file}" | cut -d" " -f2 | tr -d "\r")
rm "${tmp_header_file}"

curl "${upload_url}" \
  -H "Content-Length: ${NUM_BYTES}" \
  -H "X-Goog-Upload-Offset: 0" \
  -H "X-Goog-Upload-Command: upload, finalize" \
  --data-binary "@${AUDIO_PATH}" 2> /dev/null > file_info.json

file_uri=$(jq -r ".file.uri" file_info.json)
echo file_uri=$file_uri

curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GOOGLE_API_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
      "contents": [{
        "parts":[
          {"file_data":{"mime_type": "'"${MIME_TYPE}"'", "file_uri": "'"${file_uri}"'"}},
          {"text": "Generate a transcript of the speech."}]
        }]
       }' 2> /dev/null > response.json

cat response.json
echo
```

## Refer to timestamps

You can ask questions about specific sections of the audio file by using timestamps in the format `MM:SS`.

#### Python

```python
myfile = client.files.upload(file="path/to/sample.mp3")
response = client.models.generate_content(
    model="gemini-2.0-flash",
    contents=[myfile, "Provide a transcript of the speech from 02:30 to 03:29."],
)
print(response.text)
```

#### JavaScript

```javascript
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
  const myfile = await ai.files.upload({
    file: "path/to/sample.mp3",
    config: { mimeType: "audio/mpeg" },
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: createUserContent([
      createPartFromUri(myfile.uri, myfile.mimeType),
      "Provide a transcript of the speech from 02:30 to 03:29.",
    ]),
  });
  console.log(response.text);
}

await main();
```

#### Go

```go
file, err := client.UploadFileFromPath(ctx, "path/to/sample.mp3", nil)
if err != nil {
    log.Fatal(err)
}
defer client.DeleteFile(ctx, file.Name)

model := client.GenerativeModel("gemini-2.0-flash")
resp, err := model.GenerateContent(ctx,
    genai.FileData{URI: file.URI},
    genai.Text("Provide a transcript of the speech from 02:30 to 03:29."))
if err != nil {
    log.Fatal(err)
}

printResponse(resp)
```

#### REST

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GOOGLE_API_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
      "contents": [{
        "parts":[
          {"file_data":{"mime_type": "'"${MIME_TYPE}"'", "file_uri": "'"${file_uri}"'"}},
          {"text": "Provide a transcript of the speech from 02:30 to 03:29."}]
        }]
       }'
```

## Count tokens

You can count the number of tokens in an audio file by calling the `countTokens` method. For example:

#### Python

```python
response = client.models.count_tokens(
    model="gemini-2.0-flash", contents=[myfile, "Describe this audio clip"]
)
print(response)
```

#### JavaScript

```javascript
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
  const myfile = await ai.files.upload({
    file: "path/to/sample.mp3",
    config: { mimeType: "audio/mpeg" },
  });

  const countTokensResponse = await ai.models.countTokens({
    model: "gemini-2.0-flash",
    contents: createUserContent([
      createPartFromUri(myfile.uri, myfile.mimeType),
      "Describe this audio clip",
    ]),
  });
  console.log(countTokensResponse);
}

await main();
```

#### Go

```go
file, err := client.UploadFileFromPath(ctx, "path/to/sample.mp3", nil)
if err != nil {
    log.Fatal(err)
}
defer client.DeleteFile(ctx, file.Name)

model := client.GenerativeModel("gemini-2.0-flash")

tokResp, err := model.CountTokens(ctx,
    genai.FileData{URI: file.URI},
    genai.Text("Describe this audio clip."))
if err != nil {
    log.Fatal(err)
}

fmt.Printf("Tokens: %d\n", tokResp.TotalTokens)
```

#### REST

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:countTokens?key=$GOOGLE_API_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
      "contents": [{
        "parts":[
          {"file_data":{"mime_type": "'"${MIME_TYPE}"'", "file_uri": "'"${file_uri}"'"}},
          {"text": "Describe this audio clip"}]
        }]
       }'
```

## Supported audio formats

Gemini supports the following audio format MIME types:

| Audio format | MIME type |
|-------------|-----------|
| WAV | `audio/wav` |
| MP3 | `audio/mp3` |
| AIFF | `audio/aiff` |
| AAC | `audio/aac` |
| OGG Vorbis | `audio/ogg` |
| FLAC | `audio/flac` |

## Technical details about audio

- Gemini represents each second of audio as 32 tokens. For example, one minute of audio is represented as 1,920 tokens.
- Gemini can only infer responses to English-language speech.
- Gemini can "understand" non-speech components, such as birdsong or sirens.
- The maximum supported length of audio data in a single prompt is 9.5 hours. Gemini doesn't limit the number of audio files in a single prompt; however, the total combined length of all audio files in a single prompt can't exceed 9.5 hours.
- Gemini downsamples audio files to a 16 Kbps data resolution.
- If the audio source contains multiple channels, Gemini combines those channels down to a single channel.

## What's next

- File prompting strategies: The Gemini API supports prompting with text, image, audio, and video data, also known as multimodal prompting.
- System instructions: System instructions let you steer the behavior of the model based on your specific needs and use cases.
- Safety guidance: Sometimes generative AI models produce unexpected outputs, such as outputs that are inaccurate, biased, or offensive. Post-processing and human evaluation are essential to limit the risk of harm from such outputs.
