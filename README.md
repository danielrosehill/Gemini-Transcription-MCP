# Gemini Transcription MCP - WIP/Notes

![Note: Transcribed Text](https://img.shields.io/badge/⚠️_Note-Transcribed_Text-blue)

*This text was generated from speech!*

This repository is a... placeholder for working on an MCP server that I would like to have on hand frequently.  As I haven't found one that does exactly this I am working on it as a WIP:

The objective of the MCP server would be to provide the user with the ability to generate textual transcriptions of audio files in binary format. 

As a multimodal model, Gemini has a significant advantage, in my opinion and experience, over conventional speech to text: this is the ability to provide both an audio file and a steering text as an input. This allows the user to generate an output that combines both transcription and language processing in one single API call and operation. 

 The rationale for creating a dedicated MCP server for only this function with Gemini is to avoid the influx of unwanted context that comes when providing large tool definitions. 
 
 The objective and project here is to create an MCP that only provides for this single API call.
 
 It takes in the post-processing prompt so that the user simply has to invoke the MCP function, and the audio binary will be returned with the cleanup system prompt or post-processing prompt already baked into the MCP operation and the API call.