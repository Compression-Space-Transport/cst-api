# CST API

Low-level serverless API for viewing/changing things on the router. Works in concert with tail2s3 and config-copy.

## Requirements

- The router needs to run without the cloud
- Changes should be idempotent
- Code should be simple and understandable

## Basic Design Ideas

- Monitor and configure router through simple API (more sophisticated API's should be built on top of and separate from this one to avoid bload)
- Router interacts with cloud via s3
  - Upload state info like dhcp leases
  - Download complete config files and reload affected services when required
