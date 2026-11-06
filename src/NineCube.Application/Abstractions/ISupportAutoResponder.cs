namespace NineCube.Application.Abstractions;

/// <summary>
/// The support-chat auto responder. A retrieval responder, not a language model: it answers a
/// customer's message only from the store's own knowledge - the policy text stored in Settings
/// plus a fixed greeting - and returns null for anything else so a human agent takes over.
/// </summary>
public interface ISupportAutoResponder
{
    /// <summary>Builds an automated reply for a common question, or null when the message is not
    /// one the system can answer honestly from its own knowledge.</summary>
    Task<string?> AutoReplyAsync(string customerMessage, CancellationToken ct = default);
}
