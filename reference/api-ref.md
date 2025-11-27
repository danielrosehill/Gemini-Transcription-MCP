# API Reference

Google's current API ref for audio understanding is here:

https://ai.google.dev/gemini-api/docs/audio

The document is provided in full in this reference folder. I am supplementing that information with my own notes:

# Audio File Upload

As auth will be required for this to work, I think that the File API method will be more reliable. 

However - note the 20 MB cap.

I think that the limitation can be worked around by Down sampling the audio file captured from the user before sending it to the Gemini API. 

The standard best practice in capturing audio free transcription is to captures in mono and at a relatively low bit rate. Given that the audio file I present is unlikely to have been captured using these presets, the MCP should run a conversion script on the audio binary before sending it to Gemini. 

Note as well: Gemini downsamples audio files to a 16 Kbps data resolution.

Therefore, at a minimum, we should downsample to this data res to avoid needessly sending up large files that won't be processed at that bitrate anyway.


## File Formats

Note the supported formats include:

- ogg
- flac
- mp3
sss

## How Prompts Are Provided

Note the format of the basic code snippet. 

```
from google import genai

client = genai.Client()
myfile = client.files.upload(file='path/to/sample.mp3')
prompt = 'Generate a transcript of the speech.'

response = client.models.generate_content(
  model='gemini-2.5-flash',
  contents=[prompt, myfile]
)

print(response.text)
```

As you can see, the file is provided with a path and the prompt is provided directly after it as an independent entity. 

To support the operation of the MCP server, the prompt should be prefilled/standardised. So only the path will be substituted when making the API call.