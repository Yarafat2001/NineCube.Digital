using NineCube.Application.Contracts;

namespace NineCube.Application.Abstractions;

/// <summary>
/// The grounded support assistant. This is a retrieval responder over the real database, not a
/// language model: every product, price, stock figure, order status and policy sentence it returns
/// is read from stored rows in the same request. It never invents models, prices, certifications
/// or delivery promises, and when it finds nothing it says so honestly.
/// </summary>
public interface IChatAssistant
{
    /// <summary>Answers one question for the caller identified by <see cref="ICurrentUser"/>.</summary>
    Task<ChatAssistantAnswer> AnswerAsync(string question, CancellationToken ct = default);
}

/// <summary>The assistant's answer text plus the catalogue rows it was grounded on.</summary>
public sealed record ChatAssistantAnswer(string Reply, IReadOnlyList<ChatAssistantMatchDto> Matches);
