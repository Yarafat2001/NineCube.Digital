using NineCube.Application.Abstractions;

namespace NineCube.Infrastructure.Storage;

/// <summary>
/// Local disk storage for uploaded product media. Files get a generated GUID name (never the client's
/// file name), so an upload can neither overwrite another file nor escape the folder. The API serves this
/// directory from <see cref="PublicPrefix"/>, and the directory lives outside the build output, so
/// uploads survive a restart or a redeploy of the binaries.
/// </summary>
public sealed class ProductFileStorage(string rootPath, string publicPrefix) : IProductStorage
{
    private readonly string _root = Path.GetFullPath(rootPath);

    public string PublicPrefix { get; } = string.IsNullOrWhiteSpace(publicPrefix) ? "/uploads" : "/" + publicPrefix.Trim('/');

    public string RootPath => _root;

    public async Task<string> StoreAsync(Stream content, string extension, CancellationToken ct = default)
    {
        Directory.CreateDirectory(_root);
        var fileName = $"{Guid.NewGuid():N}.{extension}";
        var fullPath = Path.Combine(_root, fileName);

        await using var file = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write, FileShare.None,
            64 * 1024, FileOptions.Asynchronous);
        await content.CopyToAsync(file, ct);
        await file.FlushAsync(ct);

        return $"{PublicPrefix}/{fileName}";
    }

    public Task DeleteAsync(string? publicUrl, CancellationToken ct = default)
    {
        var path = Resolve(publicUrl);
        if (path is not null && File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(string? publicUrl, CancellationToken ct = default) =>
        Task.FromResult(Resolve(publicUrl) is { } path && File.Exists(path));

    /// <summary>The physical file behind a public url, or null when the url is not one of our uploads.</summary>
    private string? Resolve(string? publicUrl)
    {
        if (string.IsNullOrWhiteSpace(publicUrl)) return null;
        if (!publicUrl.StartsWith(PublicPrefix + "/", StringComparison.OrdinalIgnoreCase)) return null;

        var fileName = Path.GetFileName(publicUrl[(PublicPrefix.Length + 1)..]);
        if (fileName.Length == 0) return null;

        return Path.Combine(_root, fileName);
    }
}
