# V1SnapshotsGet200Response

## Properties

| Name          | Type                                                                                            | Description | Notes |
| ------------- | ----------------------------------------------------------------------------------------------- | ----------- | ----- |
| **snapshots** | [**List[V1SnapshotsGet200ResponseSnapshotsInner]**](V1SnapshotsGet200ResponseSnapshotsInner.md) |             |

## Example

```python
from paws_client.models.v1_snapshots_get200_response import V1SnapshotsGet200Response

# TODO update the JSON string below
json = "{}"
# create an instance of V1SnapshotsGet200Response from a JSON string
v1_snapshots_get200_response_instance = V1SnapshotsGet200Response.from_json(json)
# print the JSON string representation of the object
print(V1SnapshotsGet200Response.to_json())

# convert the object into a dict
v1_snapshots_get200_response_dict = v1_snapshots_get200_response_instance.to_dict()
# create an instance of V1SnapshotsGet200Response from a dict
v1_snapshots_get200_response_from_dict = V1SnapshotsGet200Response.from_dict(v1_snapshots_get200_response_dict)
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
