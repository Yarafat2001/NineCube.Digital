namespace NineCube.Application.Services;

public sealed class StorefrontOptions
{
    public string BaseUrl { get; set; } = "https://yarafat2001.github.io/NineCube.Digital/";

    public string Link(string route)
    {
        if (!Uri.TryCreate(BaseUrl, UriKind.Absolute, out var uri) || uri.Scheme is not ("https" or "http"))
            throw new InvalidOperationException("Storefront:BaseUrl must be an absolute HTTP(S) URL.");
        return uri.GetLeftPart(UriPartial.Path).TrimEnd('/') + "/#/" + route.TrimStart('/');
    }
}
