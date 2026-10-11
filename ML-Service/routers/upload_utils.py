MAX_FILE_BYTES = 5 * 1024 * 1024


async def read_limited(upload):
    content = await upload.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise ValueError("FILE_TOO_LARGE")
    return content
