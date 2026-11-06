using Microsoft.EntityFrameworkCore;
using NineCube.Api.Auth;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Application.Services;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

public sealed record CreateChatConversationRequest(string? Subject, string Message);
public sealed record PostChatMessageRequest(string Body);
public sealed record ChatAssistantRequest(string Question, int? ConversationId);

/// <summary>
/// Customer-support chat plus the catalogue-grounded assistant. Status and authorKind leave the
/// API as the contract's lowercase strings ("open" / "closed", "customer" / "staff" / "assistant").
/// A customer only ever sees their own conversations; asking for somebody else's is a 404, so
/// existence never leaks.
/// </summary>
public sealed class ChatEndpoints : IEndpoint
{
    private const int MaxMessageLength = 2000;
    private const int MaxSubjectLength = 200;
    private const string AssistantName = "NineCube Assistant";
    private const string SupportBotName = "NineCube Support";

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/chat").WithTags("Chat");

        // unreadCount definition: messages in the conversation not authored by the caller's kind
        // since the caller last posted there (assistant rows count as unread for both sides).
        group.MapGet("/conversations", async (IAppDbContext db, ICurrentUser user, CancellationToken ct) =>
        {
            var isStaff = user.Role != UserRole.Customer;
            var callerKind = isStaff ? ChatAuthorKind.Staff : ChatAuthorKind.Customer;

            var query = db.ChatConversations.AsNoTracking();
            if (!isStaff) query = query.Where(c => c.CustomerId == user.CustomerId);
            var conversations = await query
                .OrderByDescending(c => c.UpdatedAt).ThenByDescending(c => c.Id)
                .Take(100).ToListAsync(ct);

            var ids = conversations.Select(c => c.Id).ToList();
            if (ids.Count == 0) return Results.Ok(Array.Empty<ChatConversationSummaryDto>());

            var callerLast = (await db.ChatMessages.AsNoTracking()
                .Where(m => ids.Contains(m.ConversationId) && m.AuthorKind == callerKind)
                .GroupBy(m => m.ConversationId)
                .Select(g => new { ConversationId = g.Key, LastId = g.Max(m => m.Id) })
                .ToListAsync(ct)).ToDictionary(x => x.ConversationId, x => x.LastId);

            var unread = (await db.ChatMessages.AsNoTracking()
                .Where(m => ids.Contains(m.ConversationId) && m.AuthorKind != callerKind)
                .Select(m => new { m.ConversationId, m.Id })
                .ToListAsync(ct))
                .GroupBy(m => m.ConversationId)
                .ToDictionary(g => g.Key,
                    g => g.Count(m => m.Id > (callerLast.TryGetValue(g.Key, out var last) ? last : 0)));

            var lastIds = await db.ChatMessages.AsNoTracking()
                .Where(m => ids.Contains(m.ConversationId))
                .GroupBy(m => m.ConversationId)
                .Select(g => g.Max(m => m.Id))
                .ToListAsync(ct);
            var lastMessages = (await db.ChatMessages.AsNoTracking()
                .Where(m => lastIds.Contains(m.Id))
                .ToListAsync(ct)).ToDictionary(m => m.ConversationId);

            return Results.Ok(conversations.Select(c => new ChatConversationSummaryDto(
                c.Id,
                c.Subject,
                c.Status.ToString().ToLowerInvariant(),
                c.CreatedAt,
                c.UpdatedAt,
                lastMessages.TryGetValue(c.Id, out var last)
                    ? new ChatLastMessageDto(last.Body, last.AuthorKind.ToString().ToLowerInvariant(), last.CreatedAt)
                    : null,
                unread.TryGetValue(c.Id, out var count) ? count : 0)).ToArray());
        }).RequireAuthorization(Policies.CustomerStaffOrAdmin);

        group.MapPost("/conversations", async (CreateChatConversationRequest request, IAppDbContext db, ICurrentUser user,
            IClock clock, INotificationWriter notifications, ISupportAutoResponder autoResponder, CancellationToken ct) =>
        {
            ValidateMessage(request.Message);
            if (request.Subject?.Length > MaxSubjectLength)
                throw new BusinessValidationException($"Use a subject of at most {MaxSubjectLength} characters.");

            var customerId = user.CustomerId ?? throw new NotFoundException("Customer profile was not found.");
            var customerName = await db.Customers.AsNoTracking()
                .Where(c => c.Id == customerId).Select(c => c.Name).FirstOrDefaultAsync(ct)
                ?? throw new NotFoundException("Customer profile was not found.");

            var now = clock.UtcNow;
            var conversation = new ChatConversation
            {
                CustomerId = customerId,
                Subject = string.IsNullOrWhiteSpace(request.Subject) ? "Support chat" : request.Subject.Trim(),
                Status = ChatConversationStatus.Open,
                CreatedAt = now,
                UpdatedAt = now
            };
            conversation.Messages.Add(new ChatMessage
            {
                AuthorKind = ChatAuthorKind.Customer,
                AuthorUserId = user.UserId,
                AuthorName = customerName,
                Body = request.Message.Trim(),
                CreatedAt = now
            });

            // A common question answered from the store's own knowledge gets an instant automated
            // reply; a new conversation has no staff message yet, so the responder always gets the
            // first turn before any human replies.
            ChatMessage? autoReply = null;
            var autoText = await autoResponder.AutoReplyAsync(request.Message, ct);
            if (autoText is not null)
            {
                autoReply = new ChatMessage
                {
                    AuthorKind = ChatAuthorKind.Assistant,
                    AuthorName = SupportBotName,
                    Body = autoText,
                    CreatedAt = now
                };
                conversation.Messages.Add(autoReply);
            }

            db.ChatConversations.Add(conversation);

            await notifications.AddForStaffAsync(NotificationType.ChatMessage, "New support chat",
                Truncate($"{customerName} opened a chat: {conversation.Messages[0].Body}", 480), "/chat", ct);

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { conversation.Id, autoReply = autoReply is null ? null : ToDto(autoReply) });
        }).RequireAuthorization(Policies.CustomerOnly);

        group.MapGet("/conversations/{id:int}/messages", async (int id, int? afterId, IAppDbContext db,
            ICurrentUser user, CancellationToken ct) =>
        {
            var conversation = await FindVisibleAsync(db, id, user, ct);

            var query = db.ChatMessages.AsNoTracking().Where(m => m.ConversationId == conversation.Id);
            if (afterId is int after) query = query.Where(m => m.Id > after);

            var messages = await query.OrderBy(m => m.Id).ToListAsync(ct);
            return Results.Ok(messages.Select(ToDto).ToArray());
        }).RequireAuthorization(Policies.CustomerStaffOrAdmin);

        group.MapPost("/conversations/{id:int}/messages", async (int id, PostChatMessageRequest request, IAppDbContext db,
            ICurrentUser user, IClock clock, INotificationWriter notifications, ISupportAutoResponder autoResponder,
            CancellationToken ct) =>
        {
            ValidateMessage(request.Body);

            var isStaff = user.Role != UserRole.Customer;
            var conversation = await db.ChatConversations.FirstOrDefaultAsync(c => c.Id == id, ct)
                ?? throw new NotFoundException("Conversation was not found.");
            if (!isStaff && conversation.CustomerId != user.CustomerId)
                throw new NotFoundException("Conversation was not found.");

            var now = clock.UtcNow;
            var message = new ChatMessage
            {
                ConversationId = conversation.Id,
                AuthorKind = isStaff ? ChatAuthorKind.Staff : ChatAuthorKind.Customer,
                AuthorUserId = user.UserId,
                AuthorName = await AuthorNameAsync(db, conversation, user, isStaff, ct),
                Body = request.Body.Trim(),
                CreatedAt = now
            };
            db.ChatMessages.Add(message);
            conversation.UpdatedAt = now;

            // The automated reply answers common questions only while the conversation is still
            // waiting for its first human reply; once a staff member has written, they own the
            // thread and the responder stays quiet.
            ChatMessage? autoReply = null;
            if (!isStaff)
            {
                var staffAlreadyReplied = await db.ChatMessages.AsNoTracking()
                    .AnyAsync(m => m.ConversationId == conversation.Id && m.AuthorKind == ChatAuthorKind.Staff, ct);
                if (!staffAlreadyReplied)
                {
                    var autoText = await autoResponder.AutoReplyAsync(request.Body, ct);
                    if (autoText is not null)
                    {
                        autoReply = new ChatMessage
                        {
                            ConversationId = conversation.Id,
                            AuthorKind = ChatAuthorKind.Assistant,
                            AuthorName = SupportBotName,
                            Body = autoText,
                            CreatedAt = now
                        };
                        db.ChatMessages.Add(autoReply);
                    }
                }
            }

            if (isStaff)
            {
                var customerUserIds = await db.Users.AsNoTracking()
                    .Where(u => u.IsActive && u.CustomerId == conversation.CustomerId)
                    .Select(u => u.Id).ToListAsync(ct);
                foreach (var userId in customerUserIds)
                    notifications.Add(userId, NotificationType.ChatMessage, "New chat reply",
                        Truncate($"Support replied in \"{conversation.Subject}\": {message.Body}", 480), "/chat");
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = ToDto(message), autoReply = autoReply is null ? null : ToDto(autoReply) });
        }).RequireAuthorization(Policies.CustomerStaffOrAdmin);

        group.MapPost("/conversations/{id:int}/close", async (int id, IAppDbContext db, ICurrentUser user,
            IClock clock, CancellationToken ct) =>
        {
            var conversation = await db.ChatConversations.FirstOrDefaultAsync(c => c.Id == id, ct)
                ?? throw new NotFoundException("Conversation was not found.");
            conversation.Status = ChatConversationStatus.Closed;
            conversation.UpdatedAt = clock.UtcNow;
            db.AuditLogs.Add(new AuditLog
            {
                UserId = user.UserId,
                Action = "chat.conversation_closed",
                EntityType = nameof(ChatConversation),
                EntityId = id.ToString(),
                CreatedAt = clock.UtcNow
            });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { status = conversation.Status.ToString().ToLowerInvariant() });
        }).RequireAuthorization(Policies.StaffOrAdmin);

        // Public by design: guests can ask the catalogue and policy assistant without an account.
        // Persisting the exchange is the only signed-in privilege, and only into a conversation
        // the caller can actually see - an anonymous request never touches conversations.
        group.MapPost("/assistant", async (ChatAssistantRequest request, IAppDbContext db, ICurrentUser user,
            IClock clock, IChatAssistant assistant, CancellationToken ct) =>
        {
            ValidateMessage(request.Question);

            var answer = await assistant.AnswerAsync(request.Question.Trim(), ct);

            ChatConversation? conversation = null;
            if (user.IsAuthenticated && request.ConversationId is int requested)
            {
                conversation = await db.ChatConversations.FirstOrDefaultAsync(c => c.Id == requested, ct);
                if (conversation is not null && user.Role == UserRole.Customer && conversation.CustomerId != user.CustomerId)
                    conversation = null;
            }

            ChatMessage reply;
            if (conversation is not null)
            {
                var now = clock.UtcNow;
                var question = new ChatMessage
                {
                    ConversationId = conversation.Id,
                    AuthorKind = ChatAuthorKind.Customer,
                    AuthorUserId = user.UserId,
                    AuthorName = await AuthorNameAsync(db, conversation, user, user.Role != UserRole.Customer, ct),
                    Body = request.Question.Trim(),
                    CreatedAt = now
                };
                reply = new ChatMessage
                {
                    ConversationId = conversation.Id,
                    AuthorKind = ChatAuthorKind.Assistant,
                    AuthorName = AssistantName,
                    Body = Truncate(answer.Reply, MaxMessageLength),
                    CreatedAt = now
                };
                db.ChatMessages.AddRange(question, reply);
                conversation.UpdatedAt = now;
                await db.SaveChangesAsync(ct);
            }
            else
            {
                reply = new ChatMessage
                {
                    Id = 0,
                    ConversationId = 0,
                    AuthorKind = ChatAuthorKind.Assistant,
                    AuthorName = AssistantName,
                    Body = answer.Reply,
                    CreatedAt = clock.UtcNow
                };
            }

            return Results.Ok(new { reply = ToDto(reply), matches = answer.Matches });
        }).AllowAnonymous();
    }

    // ------------------------------------------------------------------ helpers

    private static void ValidateMessage(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > MaxMessageLength)
            throw new BusinessValidationException($"Enter a message of at most {MaxMessageLength} characters.");
    }

    private static async Task<ChatConversation> FindVisibleAsync(IAppDbContext db, int id, ICurrentUser user, CancellationToken ct)
    {
        var conversation = await db.ChatConversations.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new NotFoundException("Conversation was not found.");
        if (user.Role == UserRole.Customer && conversation.CustomerId != user.CustomerId)
            throw new NotFoundException("Conversation was not found.");
        return conversation;
    }

    private static async Task<string> AuthorNameAsync(IAppDbContext db, ChatConversation conversation,
        ICurrentUser user, bool isStaff, CancellationToken ct)
    {
        if (isStaff) return Truncate(user.Email ?? "NineCube Staff", MaxSubjectLength);
        return await db.Customers.AsNoTracking()
            .Where(c => c.Id == conversation.CustomerId).Select(c => c.Name).FirstOrDefaultAsync(ct)
            ?? "Customer";
    }

    private static ChatMessageDto ToDto(ChatMessage m) => new(
        m.Id,
        m.ConversationId,
        m.AuthorKind.ToString().ToLowerInvariant(),
        m.AuthorName,
        m.Body,
        m.CreatedAt);

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}
