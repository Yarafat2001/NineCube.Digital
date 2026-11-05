namespace NineCube.Domain;

public enum ChatConversationStatus { Open, Closed }

/// <summary>Who wrote a chat message. Assistant messages are written by the catalogue-grounded
/// retrieval responder, never by a language model.</summary>
public enum ChatAuthorKind { Customer, Staff, Assistant }

/// <summary>
/// One customer-support chat thread. Owned by exactly one customer; staff and administrators
/// see every thread. There is no soft delete - a closed conversation stays readable.
/// </summary>
public sealed class ChatConversation
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public string Subject { get; set; } = "Support chat";
    public ChatConversationStatus Status { get; set; } = ChatConversationStatus.Open;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<ChatMessage> Messages { get; set; } = new();
}

/// <summary>
/// A single chat message. The author name is denormalised onto the row so the transcript stays
/// readable even if the author account is later deactivated; assistant rows carry no user id.
/// </summary>
public sealed class ChatMessage
{
    public int Id { get; set; }
    public int ConversationId { get; set; }
    public ChatConversation? Conversation { get; set; }
    public ChatAuthorKind AuthorKind { get; set; }
    /// <summary>The login that wrote the message. Null for assistant-generated rows.</summary>
    public int? AuthorUserId { get; set; }
    public string AuthorName { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
