# V1SnapshotsIdBuildPostRequest

## Properties

| Name          | Type                                                                    | Description | Notes      |
| ------------- | ----------------------------------------------------------------------- | ----------- | ---------- |
| **base**      | **str**                                                                 |             |
| **setup**     | **str**                                                                 |             |
| **resources** | [**V1SessionsPostRequestResources**](V1SessionsPostRequestResources.md) |             | [optional] |

## Example

```python
from paws_client.models.v1_snapshots_id_build_post_request import V1SnapshotsIdBuildPostRequest

# TODO update the JSON string below
json = "{}"
# create an instance of V1SnapshotsIdBuildPostRequest from a JSON string
v1_snapshots_id_build_post_request_instance = V1SnapshotsIdBuildPostRequest.from_json(json)
# print the JSON string representation of the object
print(V1SnapshotsIdBuildPostRequest.to_json())

# convert the object into a dict
v1_snapshots_id_build_post_request_dict = v1_snapshots_id_build_post_request_instance.to_dict()
# create an instance of V1SnapshotsIdBuildPostRequest from a dict
v1_snapshots_id_build_post_request_from_dict = V1SnapshotsIdBuildPostRequest.from_dict(v1_snapshots_id_build_post_request_dict)
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
