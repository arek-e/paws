# V1SnapshotsGet200ResponseSnapshotsInner

## Properties

| Name           | Type                                                                                              | Description | Notes |
| -------------- | ------------------------------------------------------------------------------------------------- | ----------- | ----- |
| **id**         | **str**                                                                                           |             |
| **version**    | **int**                                                                                           |             |
| **created_at** | **datetime**                                                                                      |             |
| **size**       | [**V1SnapshotsGet200ResponseSnapshotsInnerSize**](V1SnapshotsGet200ResponseSnapshotsInnerSize.md) |             |
| **config**     | [**V1SessionsPostRequestResources**](V1SessionsPostRequestResources.md)                           |             |

## Example

```python
from paws_client.models.v1_snapshots_get200_response_snapshots_inner import V1SnapshotsGet200ResponseSnapshotsInner

# TODO update the JSON string below
json = "{}"
# create an instance of V1SnapshotsGet200ResponseSnapshotsInner from a JSON string
v1_snapshots_get200_response_snapshots_inner_instance = V1SnapshotsGet200ResponseSnapshotsInner.from_json(json)
# print the JSON string representation of the object
print(V1SnapshotsGet200ResponseSnapshotsInner.to_json())

# convert the object into a dict
v1_snapshots_get200_response_snapshots_inner_dict = v1_snapshots_get200_response_snapshots_inner_instance.to_dict()
# create an instance of V1SnapshotsGet200ResponseSnapshotsInner from a dict
v1_snapshots_get200_response_snapshots_inner_from_dict = V1SnapshotsGet200ResponseSnapshotsInner.from_dict(v1_snapshots_get200_response_snapshots_inner_dict)
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
