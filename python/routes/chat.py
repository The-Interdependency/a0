from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..storage import storage

UI_META = {
    "tab_id": "chat",
    "label": "Chat",
    "icon": "MessageSquare",
    "order": 1,
    "sections": [
        {
            "id": "conversations",
            "label": "Conversations",
            "endpoint": "/api/v1/conversations",
            "fields": [
                {"key": "id", "type": "text", "label": "ID"},
                {"key": "title", "type": "text", "label": "Title"},
                {"key": "model", "type": "badge", "label": "Model"},
                {"key": "created_at", "type": "text", "label": "Created"},
            ],
        },
        {
            "id": "messages",
            "label": "Messages",
            "endpoint": "/api/v1/conversations/{id}/messages",
            "fields": [
                {"key": "role", "type": "badge", "label": "Role"},
                {"key": "content", "type": "text", "label": "Content"},
                {"key": "model", "type": "badge", "label": "Model"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/conversations"},
        {"method": "POST", "path": "/api/v1/conversations"},
        {"method": "GET", "path": "/api/v1/conversations/{id}"},
        {"method": "PATCH", "path": "/api/v1/conversations/{id}"},
        {"method": "DELETE", "path": "/api/v1/conversations/{id}"},
        {"method": "GET", "path": "/api/v1/conversations/{id}/messages"},
        {"method": "POST", "path": "/api/v1/conversations/{id}/messages"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["chat"])


class CreateConversation(BaseModel):
    title: str = "New Chat"
    model: str = "gemini"
    userId: Optional[str] = None


class UpdateConversation(BaseModel):
    title: str


class SendMessage(BaseModel):
    content: str
    model: Optional[str] = None


@router.get("/conversations")
async def list_conversations():
    return await storage.get_conversations()


@router.post("/conversations")
async def create_conversation(body: CreateConversation):
    data = {"title": body.title, "model": body.model}
    if body.userId:
        data["user_id"] = body.userId
    return await storage.create_conversation(data)


@router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: int):
    conv = await storage.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="conversation not found")
    return conv


@router.patch("/conversations/{conv_id}")
async def update_conversation(conv_id: int, body: UpdateConversation):
    await storage.update_conversation_title(conv_id, body.title)
    return {"ok": True}


@router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: int):
    await storage.delete_conversation(conv_id)
    return {"ok": True}


@router.get("/conversations/{conv_id}/messages")
async def list_messages(conv_id: int):
    return await storage.get_messages(conv_id)


@router.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: int, body: SendMessage):
    conv = await storage.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="conversation not found")
    user_msg = await storage.create_message({
        "conversation_id": conv_id,
        "role": "user",
        "content": body.content,
        "model": body.model or conv.get("model", "gemini"),
    })
    return {"user_message": user_msg, "conversation_id": conv_id}
