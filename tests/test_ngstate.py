from fileglancer.ngstate import (
    data_link_segment,
    default_url_prefix,
    layer_sharing_key,
    layer_uses_segment,
    rewrite_layer_segment,
)

PROXY = "http://localhost/files"


def test_key_from_plain_string_source_with_pipeline_suffix():
    layer = {"source": f"{PROXY}/KEY1/img.zarr|zarr2:"}
    assert layer_sharing_key(layer, PROXY) == "KEY1"


def test_key_from_scheme_prefixed_source():
    layer = {"source": f"zarr://{PROXY}/KEY2/img.zarr"}
    assert layer_sharing_key(layer, PROXY) == "KEY2"


def test_key_from_dict_and_list_sources():
    assert layer_sharing_key({"source": {"url": f"{PROXY}/K3/a"}}, PROXY) == "K3"
    layer = {"source": ["local://annotations", {"url": f"n5://{PROXY}/K4/b"}]}
    assert layer_sharing_key(layer, PROXY) == "K4"


def test_key_none_for_foreign_or_missing_sources():
    assert layer_sharing_key({"source": "s3://bucket/x.zarr"}, PROXY) is None
    assert layer_sharing_key({"source": "local://annotations"}, PROXY) is None
    assert layer_sharing_key({"type": "annotation"}, PROXY) is None
    assert layer_sharing_key({"source": f"{PROXY}/"}, PROXY) is None


def test_proxy_with_trailing_slash():
    assert layer_sharing_key({"source": f"{PROXY}/K5/x"}, PROXY + "/") == "K5"


def test_segment_quotes_prefix_like_convert_proxied_path():
    assert data_link_segment("K", "my data") == "/K/my%20data"
    assert data_link_segment("K", "custom/prefix") == "/K/custom/prefix"


def test_rewrite_replaces_whole_segment_in_all_source_shapes():
    old, new = data_link_segment("OLD", "custom/prefix"), data_link_segment("NEW", "img.zarr")
    layer = {
        "name": "img",
        "source": [
            f"{PROXY}/OLD/custom/prefix|zarr2:",
            {"url": f"{PROXY}/OLD/custom/prefix/labels/cells|zarr2:"},
        ],
    }
    out = rewrite_layer_segment(layer, old, new)
    assert out["source"][0] == f"{PROXY}/NEW/img.zarr|zarr2:"
    assert out["source"][1]["url"] == f"{PROXY}/NEW/img.zarr/labels/cells|zarr2:"
    assert layer["source"][0].startswith(f"{PROXY}/OLD/")  # input not mutated


def test_rewrite_does_not_match_a_longer_prefix():
    layer = {"source": f"{PROXY}/OLD/img.zarr2|zarr2:"}
    out = rewrite_layer_segment(layer, data_link_segment("OLD", "img.zarr"), "/NEW/x")
    assert out["source"] == layer["source"]


def test_layer_uses_segment():
    seg = data_link_segment("OLD", "img.zarr")
    assert layer_uses_segment({"source": f"{PROXY}/OLD/img.zarr|zarr2:"}, seg)
    assert not layer_uses_segment({"source": f"{PROXY}/OLD/other.zarr"}, seg)


def test_default_url_prefix():
    assert default_url_prefix("nrs", "lab/img.zarr") == "img.zarr"
    assert default_url_prefix("nrs", "") == "nrs"
